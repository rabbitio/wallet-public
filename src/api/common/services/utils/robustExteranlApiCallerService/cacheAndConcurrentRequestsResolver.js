import { v4 } from "uuid";
import { cache } from "../../../utils/cache";
import { improveAndRethrow, logError } from "../../../utils/errorUtils";

/**
 * This util helps to avoid duplicated calls to the same resource for the same data.
 * This service tracks is there currently active calculation for resource and cache id and make all other requests
 * to the same resource with the same cache id waiting for this active calculation. When the calculation ends
 * the resolver allows all the waiting requesters to get the data from cache.
 * TODO: [tests, critical] Massively used logic - add unit tests
 */
export class CacheAndConcurrentRequestsResolver {
    constructor(
        bio,
        cacheTtl,
        maxCallAttemptsToWaitForAlreadyRunningRequest = 100,
        timeoutBetweenAttemptsToCheckWhetherAlreadyRunningRequestFinished = 1000
    ) {
        this._bio = bio;
        this._cacheTtlMs = cacheTtl;
        this._requestsManager = new ManagerOfRequestsToTheSameResource(
            bio,
            maxCallAttemptsToWaitForAlreadyRunningRequest,
            timeoutBetweenAttemptsToCheckWhetherAlreadyRunningRequestFinished
        );
    }

    async getCachedResultOrWaitForItIfThereIsActiveCalculation(cacheId) {
        try {
            let cached = cache.get(cacheId);
            if (!cached) {
                await this._requestsManager.startCalculationOrWaitForActiveToFinish(cacheId);
                cached = cache.get(cacheId);
            }

            if (cached) {
                return cached;
            }

            return null;
        } catch (e) {
            improveAndRethrow(e, `${this._bio}.getCachedResultOrWaitForItIfThereIsActiveCalculation`);
        }
    }

    saveCachedData(cacheId, data, sessionDependentData = true) {
        if (sessionDependentData) {
            cache.putSessionDependentData(cacheId, data, this._cacheTtlMs);
        } else {
            cache.put(cacheId, data, this._cacheTtlMs);
        }
    }

    markActiveCalculationAsFinished(cacheId) {
        try {
            this._requestsManager.finishActiveCalculation(cacheId);
        } catch (e) {
            improveAndRethrow(e, `${this._bio}.markActiveCalculationAsFinished`);
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
    constructor(bio, maxCallsCount = 100, timeoutDuration = 3000) {
        this.bio = bio;
        this.maxCallsCount = maxCallsCount;
        this.timeoutDuration = timeoutDuration;
        this._activeCalculationsIds = new Map();
    }

    /**
     * If there is no active calculation just creates uuid and returns it.
     * If there is active calculation waits until it removed from the active calculation uuid variable.
     *
     * @return {Promise<string|true>} returns uuid of new active calculation or true if waiting for it to be finished succeed
     */
    async startCalculationOrWaitForActiveToFinish(paramsHash = "default") {
        try {
            const activeCalculationIdForHash = this._activeCalculationsIds.get(paramsHash);
            if (activeCalculationIdForHash == null) {
                const id = v4();
                this._activeCalculationsIds.set(paramsHash, id);
                return id;
            }

            return await this._waitForCalculationIdToFinish(paramsHash, activeCalculationIdForHash, 0);
        } catch (e) {
            logError(e, "startCalculationOrWaitForActiveToFinish" + this.bio);
        }

        return null;
    }

    /**
     * Clears active calculation id.
     * WARNING: if you forget to call this method the start* one will perform maxCallsCount attempts before finishing
     * @param paramsHash {string} hash of parameters of requests. Helps to distinct the request for the same resource but
     *        having different request parameters and hold a dedicated calculation id per this hash
     */
    finishActiveCalculation(paramsHash = "default") {
        this._activeCalculationsIds.delete(paramsHash);
    }

    finishAllActiveCalculations(keyPart = "") {
        Array.from(this._activeCalculationsIds.keys()).forEach(
            key =>
                typeof key === "string" && new RegExp(keyPart).test(key) && this._activeCalculationsIds.set(key, null)
        );
    }

    async _waitForCalculationIdToFinish(paramsHash, activeCalculationId, attemptIndex = 0) {
        if (attemptIndex + 1 > this.maxCallsCount) {
            throw new Error("Max count of attempts to wait for the calculation exceeded: " + activeCalculationId);
        }

        if (this._activeCalculationsIds.get(paramsHash) !== activeCalculationId) {
            return true;
        } else {
            const it = this;
            return new Promise((resolve, reject) => {
                setTimeout(function() {
                    try {
                        resolve(it._waitForCalculationIdToFinish(paramsHash, activeCalculationId, attemptIndex + 1));
                    } catch (e) {
                        reject(e);
                    }
                }, this.timeoutDuration);
            });
        }
    }
}
