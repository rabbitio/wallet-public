import axios from "axios";

import { rpsEnsurer } from "../external-apis/utils/rpsEnsurer";
import { getDomainWithoutSubdomains, postponeExecution, safeStringify } from "./browserUtils";
import { logError } from "./errorUtils";
import { externalServicesStatsCollector } from "../services/utils/externalServicesStatsCollector";

/**
 * Template service needed to avoid duplication of the same logic when we need to call
 * external APIs to retrieve some data. The idea is to use several API providers to retrieve the same data. It helps to
 * improve the reliability of a data retrieval.
 */
export default class RobustExternalAPICallerService {
    /**
     * @param bio - service name for debugging
     * @param providersData - Array of objects of following format:
     *     {
     *         endpoint: URL string,
     *         httpMethod: one of "get", "post", "put", "delete", "patch"
     *         composeQueryString: function accepting array of values for query parameters
     *         getDataByResponse: function accepting response object and extracting required data from it
     *         composeBody: function accepting array of values for query parameters. Optional for "post", "put", "patch"
     *         RPS: number of requests per second that provider allows to perform
     *         timeout: custom timeout for HTTP request to this provider (optional)
     *     }
     *
     *     - If several requests should be done for specific provider than use an Array for httpMethod, composeQueryString
     *       properties. The result of such set of requests will be returned as an array.
     *     - we perform RPS counting all over the App to avoid blocking our clients for abusing providers
     * @param logger - function to be used for logging
     */
    constructor(bio, providersData, logger = logError) {
        providersData.forEach(provider => {
            if (
                (!provider.endpoint && provider.endpoint !== "") ||
                !provider.httpMethod ||
                !provider.getDataByResponse ||
                !provider.composeQueryString
            ) {
                throw new Error(`Wrong format of providers data for: ${provider}`);
            }
        });

        // We add niceFactor - just number to order the providers array by. It is helpful to call
        // less robust APIs only if more robust fails
        this.providers = providersData.map(provider => {
            return {
                ...provider,
                niceFactor: 1,
            };
        });
        this.bio = bio;
        this._logger = logError;
    }

    /**
     * Performs data retrieval from external APIs. Tries providers till the data is retrieved.
     *
     * @param queryParametersValues - Array of values of the parameters for URL query string
     * @param timeoutMS - http timeout to wait for response. If provider has its specific timeout value then it is used
     * @param cancelToken - axios token to force-cancel requests from high-level code
     * @param attemptsCount - number of attempts to be performed
     * @param doNotFailForNowData - pass true if you do not want us to throw an error if we retrieved null data from all the providers
     * @return {Promise} resolving to retrieved data (or array of results if specific provider requires
     *         several requests. NOTE: we flatten nested arrays - results of each separate request done for the specific provider)
     * @throws Error if requests to all providers are failed
     */
    // TODO: [refactoring, critical] update backend copy of this service
    async callExternalAPI(
        queryParametersValues = [],
        timeoutMS = 3500,
        cancelToken = null,
        attemptsCount = 1,
        doNotFailForNowData = false
    ) {
        let result;
        for (let i = 0; (i < attemptsCount || result?.shouldBeForceRetried) && result?.data == null; ++i) {
            result = null;
            try {
                if (i === 0 && !result?.shouldBeForceRetried) {
                    result = await this._performCallAttempt(queryParametersValues, timeoutMS, cancelToken);
                } else {
                    const minRPS = this.providers.reduce(
                        (prev, provider) => (provider.RPS < prev ? provider.RPS : prev),
                        this.providers[0].RPS
                    );
                    result = await new Promise((resolve, reject) => {
                        // Postponing next attempt for minimal RPS over all providers to ensure at least one will not fail next time due to RPS exceeding
                        setTimeout(async () => {
                            try {
                                resolve(await this._performCallAttempt(queryParametersValues, timeoutMS, cancelToken));
                            } catch (e) {
                                reject(e);
                            }
                        }, minRPS || 0);
                    });
                }
                if (result.errors?.length) {
                    this._logger(
                        new Error(
                            `Failed to retrieve data from providers at attempt ${i}. All errors are: ${safeStringify(
                                result.errors
                            )}.`
                        ),
                        "callExternalAPI",
                        "",
                        true
                    );
                }
            } catch (e) {
                this._logger(e, "callExternalAPI", "Failed to perform external providers calling");
            }
        }

        if (result?.data == null) {
            const error = new Error(
                `Failed to retrieve data. It means all attempts have been failed. DEV: add more attempts to this data retrieval`
            );
            if (!doNotFailForNowData) {
                throw error;
            } else {
                this._logger(error, "callExternalAPI");
            }
        }

        return result?.data;
    }

    async _performCallAttempt(queryParametersValues, timeoutMS, cancelToken) {
        const providers = this._reorderProvidersByNiceFactor();
        let data = undefined,
            providerIndex = 0,
            countOfRequestsDeclinedByRPS = 0,
            errors = [];
        while (!data && providerIndex < providers.length) {
            let provider = providers[providerIndex];
            const domain = getDomainWithoutSubdomains(provider.endpoint);
            if (provider.RPS && rpsEnsurer.isRPSExceeded(domain)) {
                ++providerIndex; // Current provider's RPS is exceeded so trying next provider
                ++countOfRequestsDeclinedByRPS;
                continue;
            }

            try {
                const axiosConfig = { ...(cancelToken ? { cancelToken } : {}), timeout: provider.timeout || timeoutMS };
                const httpMethods = Array.isArray(provider.httpMethod) ? provider.httpMethod : [provider.httpMethod];
                const queryStringComposers = Array.isArray(provider.composeQueryString)
                    ? provider.composeQueryString
                    : [provider.composeQueryString];
                const iterationsData = [];
                for (let i = 0; i < httpMethods.length; ++i) {
                    const endpoint = `${provider.endpoint}${queryStringComposers[i](queryParametersValues)}`;
                    let params = [];
                    if (httpMethods[i] === "post" || httpMethods[i] === "put" || httpMethods[i] === "patch") {
                        params = [
                            endpoint,
                            provider.composeBody ? provider.composeBody(queryParametersValues) : null,
                            axiosConfig,
                        ];
                    } else {
                        params = [endpoint, axiosConfig];
                    }

                    rpsEnsurer.actualizeLastCalledTimestamp(domain, provider.RPS);

                    let response = null;
                    if (i === 0) {
                        response = await axios[httpMethods[i]](...params);
                        externalServicesStatsCollector.externalServiceCalledWithoutError(provider.endpoint);
                    } else {
                        // For requests starting from second one we postpone each request to not to exceed RPS of current provider
                        response = await postponeExecution(
                            async () => await axios[httpMethods[i]](...params),
                            provider.RPS
                        );
                    }
                    const responseData = provider.getDataByResponse(response, queryParametersValues);
                    responseData && iterationsData.push(responseData);
                }
                if (iterationsData.length) {
                    data = httpMethods.length > 1 ? iterationsData.flat() : iterationsData[0];
                } else {
                    punishProvider(provider);
                }
            } catch (e) {
                punishProvider(provider);
                externalServicesStatsCollector.externalServiceFailed(provider.endpoint, e?.message);
                errors.push(e);
            } finally {
                providerIndex++;
            }
        }

        // If we are declining more than 50% of providers (by exceeding RPS) then we note that it better to retry the whole process of providers requesting
        const shouldBeForceRetried = data == null && countOfRequestsDeclinedByRPS > Math.floor(providers.length * 0.5);

        return { data, shouldBeForceRetried, errors };
    }

    _reorderProvidersByNiceFactor() {
        const providersCopy = [...this.providers];

        return providersCopy.sort((p1, p2) => p2.niceFactor - p1.niceFactor);
    }
}

function punishProvider(provider) {
    provider.niceFactor = provider.niceFactor - 1;
}
