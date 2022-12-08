import RobustExternalAPICallerService from "./robustExternalAPICallerService";
import { improveAndRethrow, logError } from "../../../utils/errorUtils";
import { getHash } from "../../../adapters/crypto-utils";
import { CacheAndConcurrentRequestsResolver } from "./cacheAndConcurrentRequestsResolver";

/**
 * Improved edit of RobustExternalApiCallerService supporting cache and management of concurrent requests to the same resource.
 * TODO: [tests, critical] Massively used logic
 */
export class CachedRobustExternalApiCallerService {
    constructor(
        bio,
        providersData,
        cacheTtlMs = 10000,
        maxCallAttemptsToWaitForAlreadyRunningRequest = 50,
        timeoutBetweenAttemptsToCheckWhetherAlreadyRunningRequestFinished = 3000,
        logger = logError
    ) {
        this._provider = new RobustExternalAPICallerService(`cached_${bio}`, providersData, logger);
        this._cacheTtlMs = cacheTtlMs;
        this._cahceAndRequestsResolver = new CacheAndConcurrentRequestsResolver(
            bio,
            cacheTtlMs,
            maxCallAttemptsToWaitForAlreadyRunningRequest,
            timeoutBetweenAttemptsToCheckWhetherAlreadyRunningRequestFinished
        );
        this._cahceIds = [];
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
        let cacheId = null;
        try {
            const hash = customHashFunctionForParams
                ? customHashFunctionForParams(parametersValues)
                : !parametersValues
                ? ""
                : getHash(JSON.stringify(parametersValues));
            cacheId = `${this._provider.bio}-${hash}`;
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }

        try {
            const cached = await this._cahceAndRequestsResolver.getCachedResultOrWaitForItIfThereIsActiveCalculation(
                cacheId
            );

            if (cached) {
                return cached;
            }

            const data = await this._provider.callExternalAPI(
                parametersValues,
                timeoutMS,
                cancelToken,
                attemptsCount,
                doNotFailForNowData
            );

            this._cahceAndRequestsResolver.saveCachedData(cacheId, data);
            this._cahceIds.indexOf(cacheId) < 0 && this._cahceIds.push(cacheId);

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
}