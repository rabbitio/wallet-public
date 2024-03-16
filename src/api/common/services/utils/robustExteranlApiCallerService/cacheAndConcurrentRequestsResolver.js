import { v4 } from "uuid";
import { improveAndRethrow, Logger } from "@rabbitio/ui-kit";

import { cache } from "../../../utils/cache.js";

/**
 * This util helps to avoid duplicated calls to a shared resource.
 * It tracks is there currently active calculation for the specific cache id and make all other requests
 * with the same cache id waiting for this active calculation to be finished. When the calculation ends
 * the resolver allows all the waiting requesters to get the data from cache and start their own calculations.
 *
 * This class should be instantiated inside some other service where you need to request some resource concurrently.
 * Rules:
 * 1. When you need to make a request inside your main service call 'getCachedOrWaitForCachedOrAcquireLock'
 *    on the instance of this class and await for the result. If the flag allowing to start calculation is true
 *    then you can request data inside your main service. Otherwise you should use the cached data as an another
 *    requester just finished the most resent requesting and there is actual data in the cache that
 *    is returned to you here.
 * 1.1 Also you can acquire a lock directly if you don't want to get cached data. Use the corresponding method 'acquireLock'.
 *
 * 2. If you start requesting (when you successfully acquired the lock) then after receiving the result of your
 *    requesting you should call the 'saveCachedData' so the retrieved data will appear in the cache.
 *
 * 3. If you successfully acquired the lock then you should after calling the 'saveCachedData' call
 *    the 'releaseLock' - this is mandatory to release the lock and allow other requesters to perform their requests.
 *    WARNING: If for any reason you forget to call this method then this class instance will wait perpetually for
 *    the lock releasing and all your attempts to request the data will constantly fail. So usually call it
 *    inside the 'finally' block.
 *
 * TODO: [tests, critical++] add unit tests - massively used logic and can produce sophisticated concurrency bugs
 */
export class CacheAndConcurrentRequestsResolver {
    /**
     * @param bio {string} unique identifier for the exact service
     * @param cacheTtl {number|null} time to live for cache ms. 0 or null means the cache cannot expire
     * @param [maxCallAttemptsToWaitForAlreadyRunningRequest=100] {number} number of request allowed to do waiting for
     *        result before we fail the original request. Use custom value only if you need to make the attempts count
     *        and polling interval changes.
     * @param [timeoutBetweenAttemptsToCheckWhetherAlreadyRunningRequestFinished=1000] {number}
     *        timeout ms for polling for a result. if you change maxCallAttemptsToWaitForAlreadyRunningRequest
     *        then this parameter maybe also require the custom value.
     * @param [removeExpiredCacheAutomatically=true] {boolean}
     */
    constructor(
        bio,
        cacheTtl,
        removeExpiredCacheAutomatically = true,
        maxCallAttemptsToWaitForAlreadyRunningRequest = 100,
        timeoutBetweenAttemptsToCheckWhetherAlreadyRunningRequestFinished = 1000
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
        this._cacheTtlMs = cacheTtl != null ? cacheTtl : null;
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
     * This method checks is there cached data and ether
     * - returns you flag that you can start requesting data from the shared resource
     * - or if there is already started calculation waits until it is finished (removed from this service)
     *   and returns you the retrieved data
     * - or just returns you the cached data
     *
     * 'canStartDataRetrieval' equal true means that the lock was acquired, and you should manually call 'saveCachedData'
     * if needed and then 'releaseLock' to mark this calculation as finished so other
     * requesters can take their share of the resource.
     *
     * @param cacheId {string}
     * @return {Promise<({
     *             canStartDataRetrieval: true,
     *             cachedData: any,
     *             lockId: string
     *         }|{
     *             canStartDataRetrieval: false,
     *             cachedData: any
     *         })>}
     */
    async getCachedOrWaitForCachedOrAcquireLock(cacheId) {
        try {
            const startedAtTimestamp = Date.now();
            let cached = cache.get(cacheId);
            let cachedDataBackupIsPresentButExpired = null;
            if (cached != null && !this._removeExpiredCacheAutomatically) {
                const lastUpdateTimestamp = cache.getLastUpdateTimestamp(cacheId);
                if ((lastUpdateTimestamp ?? 0) + this._cacheTtlMs < Date.now()) {
                    /*
                     * Here we are manually clearing 'cached' value retrieved from cache to force the data loading.
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
                return {
                    canStartDataRetrieval: true,
                    cachedData: cached ?? cachedDataBackupIsPresentButExpired,
                    lockId: calculationId,
                };
            }

            return { canStartDataRetrieval: false, cachedData: cached ?? cachedDataBackupIsPresentButExpired };
        } catch (e) {
            improveAndRethrow(e, `${this._bio}.getCachedOrWaitForCachedOrAcquireLock`);
        }
    }

    /**
     * Returns just the current cache value for the given id.
     * Doesn't wait for the active calculation, doesn't acquire lock, just retrieves the current cache as it is.
     *
     * @param cacheId {string}
     * @return {any}
     */
    getCached(cacheId) {
        try {
            return cache.get(cacheId);
        } catch (e) {
            improveAndRethrow(e, "getCached");
        }
    }

    _getTtl() {
        return this._removeExpiredCacheAutomatically ? this._cacheTtlMs : null;
    }

    /**
     * Directly acquires the lock despite on cached data availability.
     * So if this method returns result === true you can start the data retrieval.
     *
     * @param cacheId {string}
     * @return {Promise<{ result: true, lockId: string }|{ result: false }>}
     */
    async acquireLock(cacheId) {
        try {
            return await this._requestsManager.acquireLock(cacheId);
        } catch (e) {
            improveAndRethrow(e, "acquireLock");
        }
    }

    /**
     * This method should be called only if you acquired a lock successfully.
     *
     * If the current lock id is not equal to the passed one the passed data will be ignored.
     * Or you can do the synchronous data merging on your side and pass the
     * wasDataMergedSynchronouslyWithMostRecentCacheState=true so your data will be stored
     * despite on the lockId.
     * WARNING: you should do this only if you are sure you perform the synchronous update.
     *
     * @param cacheId {string}
     * @param lockId {string}
     * @param data {any}
     * @param [sessionDependentData=true] {boolean}
     * @param [wasDataMergedSynchronouslyWithMostRecentCacheState=false]
     */
    saveCachedData(
        cacheId,
        lockId,
        data,
        sessionDependentData = true,
        wasDataMergedSynchronouslyWithMostRecentCacheState = false
    ) {
        try {
            if (
                wasDataMergedSynchronouslyWithMostRecentCacheState ||
                this._requestsManager.isTheLockActiveOne(cacheId, lockId)
            ) {
                /* We save passed data only if the <caller> has the currently acquired lockId.
                 * If the passed lockId is not the active one it means that other code cleared/stopped the lock
                 * acquired by the <caller> recently due to some urgent/more prior changes.
                 *
                 * But we allow user to pass the 'wasDataMergedSynchronouslyWithMostRecentCacheState' flag
                 * that tells us that the user had taken the most recent cache value and merged his new data
                 * with that cached value (AFTER possibly performing async data retrieval). This means that we
                 * can ignore the fact that his lockId is no more relevant and save the passed data
                 * as it is synchronously merged with the most recent cached data. (Synchronously merged means that
                 * the lost update cannot occur during the merge time as JS execute the synchronous functions\
                 * till the end).
                 */
                if (sessionDependentData) {
                    cache.putSessionDependentData(cacheId, data, this._getTtl());
                } else {
                    cache.put(cacheId, data, this._getTtl());
                }
            }
        } catch (e) {
            improveAndRethrow(e, `${this._bio}.saveCachedData`);
        }
    }

    /**
     * Should be called then and only then if you successfully acquired a lock with the lock id.
     *
     * @param cacheId {string}
     * @param lockId {string}
     */
    releaseLock(cacheId, lockId) {
        try {
            if (this._requestsManager.isTheLockActiveOne(cacheId, lockId)) {
                this._requestsManager.finishActiveCalculation(cacheId);
            }
        } catch (e) {
            improveAndRethrow(e, `${this._bio}.releaseLock`);
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
     */
    actualizeCachedData(cacheId, synchronousCurrentCacheProcessor, sessionDependent = true) {
        try {
            const cached = cache.get(cacheId);
            const result = synchronousCurrentCacheProcessor(cached);
            if (result?.isModified && result?.data != null) {
                if (sessionDependent) {
                    cache.putSessionDependentData(cacheId, result?.data, this._getTtl());
                } else {
                    cache.put(cacheId, result?.data, this._getTtl());
                }

                /* Here we call the lock releasing to ensure the currently active calculation will be ignored.
                 * This is needed to ensure no 'lost update'.
                 * Lost update can occur if we change data in this method and after that some calculation finishes
                 * having the earlier data as its base to calculate its data set result. And the earlier data
                 * has no changes applied inside this method, so we will lose them.
                 *
                 * This is not so good solution: ideally, we should acquire lock before performing any data updating.
                 * But the goal of this method is to provide an instant ability to update the cached data.
                 * And if we start acquiring the lock here the data update can be postponed significantly.
                 * And this kills the desired nature of this method.
                 * So we better lose some data retrieval (means abusing the resource a bit) than lose
                 * the instant update expected after this method execution.
                 */
                this._requestsManager.finishActiveCalculation(cacheId);
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
        if (this._removeExpiredCacheAutomatically) {
            cache.markCacheItemAsExpiredButDontRemove(key, this._cacheTtlMs);
        } else {
            cache.setLastUpdateTimestamp(key, Date.now() - this._cacheTtlMs - 1);
        }
        this._requestsManager.finishAllActiveCalculations(key);
    }
}

/**
 * Util class to control access to a resource when it can be called in parallel for the same result.
 * (E.g. getting today coins-fiat rates from some API).
 */
class ManagerOfRequestsToTheSameResource {
    /**
     * @param bio {string} resource-related identifier for logging
     * @param [maxPollsCount=100] {number} max number of attempts to wait when waiting for a lock acquisition
     * @param [timeoutDuration=1000] {number} timeout between the polls for a lock acquisition
     */
    constructor(bio, maxPollsCount = 100, timeoutDuration = 1000) {
        this.bio = bio;
        this.maxPollsCount = maxPollsCount;
        this.timeoutDuration = timeoutDuration;
        this._activeCalculationsIds = new Map();
        this._nextCalculationIds = new Map();
    }

    /**
     * If there is no active calculation just creates uuid and returns it.
     * If there is active calculation waits until it removed from the active calculation uuid variable.
     *
     * @param requestHash {string}
     * @return {Promise<string|boolean>} returns uuid of new active calculation or true if waiting for active
     *         calculation succeed or false if max attempts count exceeded
     */
    async startCalculationOrWaitForActiveToFinish(requestHash) {
        try {
            const activeCalculationIdForHash = this._activeCalculationsIds.get(requestHash);
            if (activeCalculationIdForHash == null) {
                const id = v4();
                this._activeCalculationsIds.set(requestHash, id);
                return id;
            }

            return await this._waitForCalculationIdToFinish(requestHash, activeCalculationIdForHash, 0);
        } catch (e) {
            Logger.logError(e, `startCalculationOrWaitForActiveToFinish_${this.bio}`);
        }

        return null;
    }

    /**
     * Acquires lock to the resource by the provided hash.
     *
     * @param requestHash {string}
     * @return {Promise<{ result: true, lockId: string }|{ result: false }>} result is true if the lock is successfully
     *         acquired, false if the max allowed time to wait for acquisition expired or any unexpected error occurs
     *         during the waiting.
     */
    async acquireLock(requestHash) {
        try {
            const activeId = this._activeCalculationsIds.get(requestHash);
            const nextId = v4();
            if (activeId == null) {
                this._activeCalculationsIds.set(requestHash, nextId);
                return { result: true, lockId: nextId };
            }

            const currentNext = this._nextCalculationIds.get(requestHash) ?? [];
            currentNext.push(nextId);
            this._nextCalculationIds.set(requestHash, currentNext);

            const waitingResult = await this._waitForCalculationIdToFinish(requestHash, activeId, 0, nextId);
            return { result: waitingResult, lockId: waitingResult ? nextId : undefined };
        } catch (e) {
            improveAndRethrow(e, "acquireLock");
        }
    }

    /**
     * Clears active calculation id.
     * WARNING: if you forget to call this method the start* one will perform maxPollsCount attempts before finishing
     * @param requestHash {string} hash of request. Helps to distinct the request for the same resource but
     *        having different request parameters and hold a dedicated calculation id per this hash
     */
    finishActiveCalculation(requestHash = "default") {
        try {
            this._activeCalculationsIds.delete(requestHash);
            const next = this._nextCalculationIds.get(requestHash) ?? [];
            if (next.length) {
                this._activeCalculationsIds.set(requestHash, next[0]);
                this._nextCalculationIds.set(requestHash, next.slice(1));
            }
        } catch (e) {
            improveAndRethrow(e, "finishActiveCalculation");
        }
    }

    finishAllActiveCalculations(keyPart = "") {
        try {
            Array.from(this._activeCalculationsIds.keys()).forEach(hash => {
                if (typeof hash === "string" && new RegExp(keyPart).test(hash)) {
                    this.finishActiveCalculation(hash);
                }
            });
        } catch (e) {
            improveAndRethrow(e, "finishAllActiveCalculations");
        }
    }

    /**
     * @param requestHash {string}
     * @param lockId {string}
     * @return {boolean}
     */
    isTheLockActiveOne(requestHash, lockId) {
        try {
            return this._activeCalculationsIds.get(requestHash) === lockId;
        } catch (e) {
            improveAndRethrow(e, "isTheLockActiveOne");
        }
    }

    /**
     * @param requestHash {string}
     * @param activeCalculationId {string|null}
     * @param [attemptIndex=0] {number}
     * @param waitForCalculationId {string|null} if you want to wait for an exact id to appear as active then pass this parameter
     * @return {Promise<boolean>} true
     *                            - if the given calculation id is no more an active one
     *                            - or it is equal to waitForCalculationId
     *                            false
     *                            - if waiting period exceeds the max allowed waiting time or unexpected error occurs
     * @private
     */
    async _waitForCalculationIdToFinish(
        requestHash,
        activeCalculationId,
        attemptIndex = 0,
        waitForCalculationId = null
    ) {
        try {
            if (attemptIndex + 1 > this.maxPollsCount) {
                // Max number of polls for active calculation id change is achieved. So we return false.
                return false;
            }

            const currentId = this._activeCalculationsIds.get(requestHash);
            if (waitForCalculationId == null ? currentId !== activeCalculationId : currentId === waitForCalculationId) {
                /* We return true depending on the usage of this function:
                 * 1. if there is calculation id that we should wait for to become an active then we return true only
                 *    if this id becomes the active one.
                 *
                 *    Theoretically we can fail to wait for the desired calculation id. This can be caused by wrong use of
                 *    this service or by any other mistakes/errors. But this waiting function will return false anyway if
                 *    the number of polls done exceeds the max allowed.
                 *
                 * 2. if we just wait for the currently active calculation id to be finished then we return true
                 *    when we notice that the current active id differs from the original passed into this function.
                 */
                return true;
            } else {
                /* The original calculation id is still the active one, so we are scheduling a new attempt to check
                 * whether the active calculation id changed or not in timeoutDuration milliseconds.
                 */
                const it = this;
                return new Promise((resolve, reject) => {
                    setTimeout(function () {
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
            Logger.logError(e, "_waitForCalculationIdToFinish", "Failed to wait for active calculation id change.");
            return false;
        }
    }
}
