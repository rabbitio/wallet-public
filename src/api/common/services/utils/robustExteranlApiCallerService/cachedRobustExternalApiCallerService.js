import RobustExternalAPICallerService from "./robustExternalAPICallerService";
import { improveAndRethrow, logError } from "../../../utils/errorUtils";
import { getHash } from "../../../adapters/crypto-utils";
import { CacheAndConcurrentRequestsResolver } from "./cacheAndConcurrentRequestsResolver";
import { safeStringify } from "../../../utils/browserUtils";

/**
 * Extended edit of RobustExternalApiCallerService supporting cache and management of concurrent requests
 * to the same resource.
 * TODO: [tests, critical] Massively used logic
 */
export class CachedRobustExternalApiCallerService {
    /**
     * @param bio {string} unique service identifier
     * @param providersData {ExternalApiProvider[]} array of providers
     * @param [cacheTtlMs=10000] {number} time to live for cache ms
     * @param [maxCallAttemptsToWaitForAlreadyRunningRequest=50] {number} number of request allowed to do waiting for result before we fail the original request
     * @param [timeoutBetweenAttemptsToCheckWhetherAlreadyRunningRequestFinished=3000] {number} timeout ms for polling for a result
     * @param [removeExpiredCacheAutomatically=true] {boolean} whether to remove cached data automatically when ttl exceeds
     * @param [mergeCachedAndNewlyRetrievedData=null] {function} function accepting cached data, newly retrieved data and id field name for list items
     *        and merging them. use if needed
     */
    constructor(
        bio,
        providersData,
        cacheTtlMs = 10000,
        maxCallAttemptsToWaitForAlreadyRunningRequest = 50,
        timeoutBetweenAttemptsToCheckWhetherAlreadyRunningRequestFinished = 3000,
        removeExpiredCacheAutomatically = true,
        mergeCachedAndNewlyRetrievedData = null
    ) {
        this._provider = new RobustExternalAPICallerService(`cached_${bio}`, providersData, logError);
        this._cacheTtlMs = cacheTtlMs;
        this._cahceAndRequestsResolver = new CacheAndConcurrentRequestsResolver(
            bio,
            cacheTtlMs,
            maxCallAttemptsToWaitForAlreadyRunningRequest,
            timeoutBetweenAttemptsToCheckWhetherAlreadyRunningRequestFinished,
            removeExpiredCacheAutomatically
        );
        this._cahceIds = [];
        this._mergeCachedAndNewlyRetrievedData = mergeCachedAndNewlyRetrievedData;
    }

    /**
     * Calls the external API or returns data from cache. Just waits if the same data already requested.
     *
     * @param parametersValues {array} array of values of the parameters for URL query string [and/or body]
     * @param timeoutMS {number} http timeout to wait for response. If provider has its specific timeout value then it is used
     * @param [cancelToken] {object|undefined} axios token to force-cancel requests from high-level code
     * @param [attemptsCount] {number|undefined} number of attempts to be performed
     * @param [customHashFunctionForParams] {function|undefined} function without params calculating the hash to be
     *        added to bio of the service to compose a unique parameters-specific cache id
     * @param [doNotFailForNowData] {boolean|undefined} pass true if you do not want us to throw an error if we retrieved null data from all the providers
     * @return {Promise<any>} resolving to retrieved data (or array of results if specific provider requires
     *         several requests. NOTE: we flatten nested arrays - results of each separate request done for the specific provider)
     * @throws Error if requests to all providers are failed
     */
    async callExternalAPICached(
        parametersValues = [],
        timeoutMS = 3500,
        cancelToken = null,
        attemptsCount = 1,
        customHashFunctionForParams = null,
        doNotFailForNowData = false
    ) {
        const loggerSource = `${this._provider.bio}.callExternalAPICached`;
        let cacheId;
        try {
            cacheId = this._calculateCacheId(parametersValues, customHashFunctionForParams);
            const result = await this._cahceAndRequestsResolver.getCachedResultOrWaitForItIfThereIsActiveCalculation(
                cacheId
            );

            if (!result.canStartDataRetrieval) {
                return result?.cachedData;
            }

            let data = await this._provider.callExternalAPI(
                parametersValues,
                timeoutMS,
                cancelToken,
                attemptsCount,
                doNotFailForNowData
            );

            if (typeof this._mergeCachedAndNewlyRetrievedData === "function") {
                data = this._mergeCachedAndNewlyRetrievedData(result?.cachedData, data, parametersValues);
            }
            if (data != null) {
                this._cahceAndRequestsResolver.saveCachedData(cacheId, data);
                this._cahceIds.indexOf(cacheId) < 0 && this._cahceIds.push(cacheId);
            }

            return data;
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        } finally {
            this._cahceAndRequestsResolver.markActiveCalculationAsFinished(cacheId);
        }
    }

    invalidateCaches() {
        this._cahceIds.forEach(key => this._cahceAndRequestsResolver.invalidate(key));
    }

    actualizeCachedData(
        params,
        synchronousCurrentCacheProcessor,
        customHashFunctionForParams = null,
        sessionDependent = true,
        actualizedAtTimestamp
    ) {
        const cacheId = this._calculateCacheId(params, customHashFunctionForParams);
        this._cahceAndRequestsResolver.actualizeCachedData(cacheId, synchronousCurrentCacheProcessor, sessionDependent);
    }

    markCacheAsExpiredButDontRemove(parametersValues, customHashFunctionForParams) {
        try {
            this._cahceAndRequestsResolver.markAsExpiredButDontRemove(
                this._calculateCacheId(parametersValues, customHashFunctionForParams)
            );
        } catch (e) {
            improveAndRethrow(e, "markCacheAsExpiredButDontRemove");
        }
    }

    _calculateCacheId(parametersValues, customHashFunctionForParams = null) {
        try {
            const hash =
                typeof customHashFunctionForParams === "function"
                    ? customHashFunctionForParams(parametersValues)
                    : !parametersValues
                    ? ""
                    : getHash(safeStringify(parametersValues));
            return `${this._provider.bio}-${hash}`;
        } catch (e) {
            improveAndRethrow(e, this._provider.bio + "_calculateCacheId");
        }
    }
}
