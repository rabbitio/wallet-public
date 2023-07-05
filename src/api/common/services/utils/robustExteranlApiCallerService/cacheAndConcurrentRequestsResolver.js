import { v4 } from "uuid";
import { cache } from "../../../utils/cache";
import { improveAndRethrow, logError } from "../../../utils/errorUtils";

/**
 * This util helps to avoid duplicated calls to the same resource for the same data.
 * This service tracks is there currently active calculation for resource and cache id and make all other requests
 * to the same resource with the same cache id waiting for this active calculation. When the calculation ends
 * the resolver allows all the waiting requesters to get the data from cache start its own calculation.
 *
 * TODO: [tests, critical++] add unit tests - massively used logic and can produce sophisticated concurrency bugs
 */
export class CacheAndConcurrentRequestsResolver {
    /**
     * @param bio {string} unique identifier for the exact service
     * @param cacheTtl {number|null} time to live for cache ms. 0 or null means the cache cannot expire
     * @param [maxCallAttemptsToWaitForAlreadyRunningRequest=100] {number} number of request allowed to do waiting for result before we fail the original request
     * @param [timeoutBetweenAttemptsToCheckWhetherAlreadyRunningRequestFinished=1000] {number} timeout ms for polling for a result
     * @param [removeExpiredCacheAutomatically=true] {boolean}
     */
    constructor(
        bio,
        cacheTtl,
        maxCallAttemptsToWaitForAlreadyRunningRequest = 100,
        timeoutBetweenAttemptsToCheckWhetherAlreadyRunningRequestFinished = 1000,
        removeExpiredCacheAutomatically = true
    ) {
        if (cacheTtl != null && cacheTtl < timeoutBetweenAttemptsToCheckWhetherAlreadyRunningRequestFinished * 2) {
            /*
             * During the lifetime of this service e.g. if the data is being retrieved slowly we can get
             * RACE CONDITION when we constantly retrieve data and during retrieval it is expired, so we are trying
             * to retrieve it again and again.
             * We have a protection mechanism that we will wait no more than
             * maxCallAttemptsToWaitForAlreadyRunningRequest * timeoutBetweenAttemptsToCheckWhetherAlreadyRunningRequestFinished
             * but this additional check is aimed to reduce potential loading time for some requests.
             */
            throw new Error(
                `DEV: Wrong parameters passed to construct ${bio} - TTL ${cacheTtl} should be 2 times greater than ${timeoutBetweenAttemptsToCheckWhetherAlreadyRunningRequestFinished}`
            );
        }
        this._bio = bio;
        this._cacheTtlMs = cacheTtl ? cacheTtl : null;
        this._maxExecutionTimeMs =
            maxCallAttemptsToWaitForAlreadyRunningRequest *
            timeoutBetweenAttemptsToCheckWhetherAlreadyRunningRequestFinished;
        this._removeExpiredCacheAutomatically = removeExpiredCacheAutomatically;
        this._requestsManager = new ManagerOfRequestsToTheSameResource(
            bio,
            maxCallAttemptsToWaitForAlreadyRunningRequest,
            timeoutBetweenAttemptsToCheckWhetherAlreadyRunningRequestFinished
        );
    }

    /**
     * When using this service this is the major method you should call to get data by cache id.
     * This method checks is there cached data and ether return you id of new calculation (just abstract id signalling for
     * other requesters that you started to calculate/request) or if there is already calculation id waits until it is
     * removed. This means it is removed because finished.
     *
     * @param cacheId {string}
     * @return {Promise<({ canStartDataRetrieval: true, cachedData: any }|{ cachedData: any })>}
     */
    async getCachedResultOrWaitForItIfThereIsActiveCalculation(cacheId) {
        try {
            const startedAtTimestamp = Date.now();
            let cached = cache.get(cacheId);
            let cachedDataBackupIsPresentButExpired = null;
            if (cache != null && !this._removeExpiredCacheAutomatically) {
                const lastUpdateTimestamp = cache.getLastUpdateTimestamp(cacheId);
                if ((lastUpdateTimestamp ?? 0) + this._cacheTtlMs < Date.now()) {
                    /*
                     * Here we are manually clearing 'cached' value retrieved from cache to force data loading.
                     * But we save its value first to the backup variable to be able to return this value if ongoing
                     * requesting fails.
                     */
                    cachedDataBackupIsPresentButExpired = cached;
                    cached = null;
                }
            }
            let calculationId = null;
            let isRetrievedCacheExpired = true;
            let isWaitingForActiveCalculationSucceeded;
            let weStillHaveSomeTimeToProceedExecution = true;
            while (
                calculationId == null &&
                cached == null &&
                isRetrievedCacheExpired &&
                weStillHaveSomeTimeToProceedExecution
            ) {
                const result = await this._requestsManager.startCalculationOrWaitForActiveToFinish(cacheId);
                calculationId = typeof result === "string" ? result : null;
                isWaitingForActiveCalculationSucceeded = typeof result === "boolean" ? result : null;
                cached = cache.get(cacheId);
                isRetrievedCacheExpired = isWaitingForActiveCalculationSucceeded && cached == null;
                weStillHaveSomeTimeToProceedExecution = Date.now() - startedAtTimestamp < this._maxExecutionTimeMs;
            }
            if (calculationId) {
                return { canStartDataRetrieval: true, cachedData: cached ?? cachedDataBackupIsPresentButExpired };
            }

            return { canStartDataRetrieval: false, cachedData: cached ?? cachedDataBackupIsPresentButExpired };
        } catch (e) {
            improveAndRethrow(e, `${this._bio}.getCachedResultOrWaitForItIfThereIsActiveCalculation`);
        }
    }

    saveCachedData(cacheId, data, sessionDependentData = true) {
        try {
            if (sessionDependentData) {
                cache.putSessionDependentData(
                    cacheId,
                    data,
                    this._removeExpiredCacheAutomatically ? this._cacheTtlMs : null
                );
            } else {
                cache.put(cacheId, data, this._removeExpiredCacheAutomatically ? this._cacheTtlMs : null);
            }
        } catch (e) {
            improveAndRethrow(e, `${this._bio}.saveCachedData`);
        }
    }

    markActiveCalculationAsFinished(cacheId) {
        try {
            this._requestsManager.finishActiveCalculation(cacheId);
        } catch (e) {
            improveAndRethrow(e, `${this._bio}.markActiveCalculationAsFinished`);
        }
    }

    /**
     * Actualized currently present cached data by key. Applies the provided function to the cached data.
     *
     * @param cacheId {string} id of cache entry
     * @param synchronousCurrentCacheProcessor (function|null} synchronous function accepting cache entry. Should return
     *        an object in following format:
     *        {
     *            isModified: boolean,
     *            data: any
     *        }
     *        the flag signals whether data was changed during the processing or not
     * @param [sessionDependent=true] {boolean} whether to mark the cache entry as session-dependent
     * @param [finishActiveCalculation=false] {boolean} whether to finish active calculations
     */
    actualizeCachedData(
        cacheId,
        synchronousCurrentCacheProcessor,
        sessionDependent = true,
        finishActiveCalculation = false
    ) {
        try {
            const cached = cache.get(cacheId);
            const result = synchronousCurrentCacheProcessor(cached);
            if (result?.isModified && result?.data != null) {
                if (sessionDependent) {
                    cache.putSessionDependentData(
                        cacheId,
                        result?.data,
                        this._removeExpiredCacheAutomatically ? this._cacheTtlMs : null
                    );
                } else {
                    cache.put(cacheId, result?.data, this._removeExpiredCacheAutomatically ? this._cacheTtlMs : null);
                }

                if (finishActiveCalculation) {
                    this._requestsManager.finishActiveCalculation(cacheId);
                }
            }
        } catch (e) {
            improveAndRethrow(e, `${this._bio}.actualizeCachedData`);
        }
    }

    invalidate(key) {
        cache.invalidate(key);
        this._requestsManager.finishActiveCalculation(key);
    }

    invalidateContaining(keyPart) {
        cache.invalidateContaining(keyPart);
        this._requestsManager.finishAllActiveCalculations(keyPart);
    }

    markAsExpiredButDontRemove(key) {
        cache.markCacheItemAsExpiredButDontRemove(key, this._cacheTtlMs);
        this._requestsManager.finishAllActiveCalculations(key);
    }
}

/**
 * Util class to control access to a resource when it can be called in parallel for the same result.
 * E.g. getting today coins-fiat rates.
 */
class ManagerOfRequestsToTheSameResource {
    /**
     * @param bio {string} resource-related identifier for logging
     * @param [maxCallsCount] {number} max number of attempts to wait for a calculation that initiated
     * @param [timeoutDuration] {number} timeout m between the checking attempts for active calculation to finish
     */
    constructor(bio, maxCallsCount = 100, timeoutDuration = 1000) {
        this.bio = bio;
        this.maxCallsCount = maxCallsCount;
        this.timeoutDuration = timeoutDuration;
        this._activeCalculationsIds = new Map();
    }

    /**
     * If there is no active calculation just creates uuid and returns it.
     * If there is active calculation waits until it removed from the active calculation uuid variable.
     *
     * @param requestHash {string}
     * @return {Promise<string|boolean>} returns uuid of new active calculation or true if waiting for active
     *         calculation succeed or false if max attempts count exceeded
     */
    async startCalculationOrWaitForActiveToFinish(requestHash = "default") {
        try {
            const activeCalculationIdForHash = this._activeCalculationsIds.get(requestHash);
            if (activeCalculationIdForHash == null) {
                const id = v4();
                this._activeCalculationsIds.set(requestHash, id);
                return id;
            }

            return await this._waitForCalculationIdToFinish(requestHash, activeCalculationIdForHash, 0);
        } catch (e) {
            logError(e, "startCalculationOrWaitForActiveToFinish" + this.bio);
        }

        return null;
    }

    /**
     * Clears active calculation id.
     * WARNING: if you forget to call this method the start* one will perform maxCallsCount attempts before finishing
     * @param requestHash {string} hash of request. Helps to distinct the request for the same resource but
     *        having different request parameters and hold a dedicated calculation id per this hash
     */
    finishActiveCalculation(requestHash = "default") {
        this._activeCalculationsIds.delete(requestHash);
    }

    finishAllActiveCalculations(keyPart = "") {
        Array.from(this._activeCalculationsIds.keys()).forEach(
            key =>
                typeof key === "string" && new RegExp(keyPart).test(key) && this._activeCalculationsIds.set(key, null)
        );
    }

    async _waitForCalculationIdToFinish(requestHash, activeCalculationId, attemptIndex = 0) {
        try {
            if (attemptIndex + 1 > this.maxCallsCount) {
                throw new Error("Max count of attempts to wait for the calculation exceeded: " + activeCalculationId);
            }

            if (this._activeCalculationsIds.get(requestHash) !== activeCalculationId) {
                return true;
            } else {
                const it = this;
                return new Promise((resolve, reject) => {
                    setTimeout(function() {
                        try {
                            resolve(
                                it._waitForCalculationIdToFinish(requestHash, activeCalculationId, attemptIndex + 1)
                            );
                        } catch (e) {
                            reject(e);
                        }
                    }, this.timeoutDuration);
                });
            }
        } catch (e) {
            return false;
        }
    }
}
