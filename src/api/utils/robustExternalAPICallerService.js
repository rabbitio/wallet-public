import axios from "axios";

import { rpsEnsurer } from "../external-apis/utils/rpsEnsurer";
import { getDomainWithoutSubdomains, postponeExecution, safeStringify } from "./browserUtils";
import { logError } from "./errorUtils";
import { externalServicesStatsCollector } from "../services/utils/externalServicesStatsCollector";

/**
 * TODO: [refactoring, critical] update backend copy of this service
 *
 * Template service needed to avoid duplication of the same logic when we need to call
 * external APIs to retrieve some data. The idea is to use several API providers to retrieve the same data. It helps to
 * improve the reliability of a data retrieval.
 *
 * You need to instantiate it by passing the set of parameters. Major is the array of providers with their related
 * parameters and specific functions. See the details below.
 */
export default class RobustExternalAPICallerService {
    /**
     * @param bio - service name for logging
     * @param providersData - Array of objects of following format:
     *     {
     *         endpoint: URL string. Note that you can add parts and parameters to it inside your implementation of
     *                   composeQueryString
     *         httpMethod: one of "get", "post", "put", "delete", "patch" or an array of these values. Array is used
     *                     when you need to do several sub-requests for the one retrieval. Like when a provider has
     *                     separate endpoints for confirmed and unconfirmed transactions. Just add the sequence of
     *                     methods like sequence of calls. E.g. if you need to do two "get" requests and one "post" to
     *                     get all the data the array should be ["get", "get", "post"]
     *         composeQueryString: {function<String>(Array<parameter>)} function accepting array of values for query
     *                             parameters and composing query string internally.
     *                             When using an array of http methods this parameter CAN contain an array of
     *                             functions for each request method. Or the same function weill be used for each sub-request
     *         changeQueryParametersForPageNumber: {function<Array<any>>(Array<any>, Object, number)} optional function changing
     *                                             query parameters according to given page number. Params are:
     *                                             0 - an array of request parameters
     *                                             1 - a response for previous page
     *                                             2 - previous page number
     *
     *                                             Implement this function if the API has pagination.
     *                                             If the request contains of sub-requests then you can add an array
     *                                             of such functions for each sub-request. Otherwise, the only function
     *                                             will be used for all sub-request.
     *         checkWhetherResponseIsForLastPage: {function<boolean>(Object, Object, number)} optional function checking
     *                                             whether a given response indicates that the last page of data was
     *                                             returned. Params are:
     *                                             0 - an array of request parameters
     *                                             1 - a response for previous page
     *                                             2 - previous page number
     *
     *                                             Implement this function if the API has pagination.
     *                                             If the request contains of sub-requests then you can add an array
     *                                             of such functions for each sub-request. Otherwise, the only function
     *                                             will be used for all sub-request.
     *         getDataByResponse: {function<any>(Object)>} function accepting response object and extracting required
     *                             data from it. Returns null of there is no data. The exact return type is up to
     *                             dedicated service instance
     *         composeBody: {function<>(Array<parameter>)}. Optional function for "post", "put", "patch" methods if you
     *                      need to add a body to request
     *         RPS: number of requests per second allowed by provider. Note that we can use lower RPS when
     *              an API abusing is detected (optional)
     *         timeout: custom timeout for HTTP requests to this provider (optional)
     *     }
     *
     *     1. When using sub-requests feature you can also add the arrays of functions for the following provider methods:
     *        - "composeQueryString"
     *        - "changeQueryParametersForPageNumber"
     *        - "checkWhetherResponseIsForLastPage"
     *        - "getDataByResponse" TODO: not implemented yet
     *        - "composeBody" TODO: not implemented yet
     *        Using arrays is up to you - if the same method can be used per each sub-request then just set the method
     *        as a value for the parameter.
     *     2. If the endpoint of dedicated provider has pagination then you should customize the behavior using
     *        "changeQueryParametersForPageNumber", "checkWhetherResponseIsForLastPage"
     *     3. We perform RPS counting all over the App to avoid blocking our clients due to abuses of the providers.
     *     4. Arrow functions are not allowed as the values for properties
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
                throw new Error(`Wrong format of providers data for: ${JSON.stringify(provider)}`);
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
        // TODO: add a check that ether all providers has RPS or no one
    }

    static defaultRPSFactor = 1;
    static rpsMultiplier = 1.05;

    /**
     * Performs data retrieval from external APIs. Tries providers till the data is retrieved.
     *
     * @param parametersValues - Array of values of the parameters for URL query string [and/or body]
     * @param timeoutMS - http timeout to wait for response. If provider has its specific timeout value then it is used
     * @param cancelToken - axios token to force-cancel requests from high-level code
     * @param attemptsCount - number of attempts to be performed
     * @param doNotFailForNowData - pass true if you do not want us to throw an error if we retrieved null data from all the providers
     * @return {Promise} resolving to retrieved data (or array of results if specific provider requires
     *         several requests. NOTE: we flatten nested arrays - results of each separate request done for the specific provider)
     * @throws Error if requests to all providers are failed
     */
    async callExternalAPI(
        parametersValues = [],
        timeoutMS = 3500,
        cancelToken = null,
        attemptsCount = 1,
        doNotFailForNowData = false
    ) {
        let result;
        for (let i = 0; (i < attemptsCount || result?.shouldBeForceRetried) && result?.data == null; ++i) {
            /**
             * We use rpsFactor to improve re-attempting to call the providers if the last attempt resulted with
             * the fail due to abused RPSes of some (most part of) providers.
             * The _performCallAttempt in such a case will return increased rpsFactor inside the result object.
             */
            const rpsFactor = result ? result.rpsFactor : RobustExternalAPICallerService.defaultRPSFactor;

            result = null;

            try {
                if (i === 0 && !result?.shouldBeForceRetried) {
                    result = await this._performCallAttempt(parametersValues, timeoutMS, cancelToken, rpsFactor);
                } else {
                    const maxRPS = Math.max(...this.providers.map(provider => provider.RPS ?? 0));
                    const waitingTimeMS = maxRPS ? 1000 / (maxRPS / rpsFactor) : 0;

                    result = await new Promise((resolve, reject) => {
                        setTimeout(async () => {
                            try {
                                resolve(
                                    await this._performCallAttempt(parametersValues, timeoutMS, cancelToken, rpsFactor)
                                );
                            } catch (e) {
                                reject(e);
                            }
                        }, waitingTimeMS);
                    });
                }
                if (result.errors?.length) {
                    const errors = result.errors;
                    this._logger(
                        new Error(`Failed at attempt ${i}. ${errors.length} errors: ${safeStringify(errors)}.`),
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

    async _performCallAttempt(parametersValues, timeoutMS, cancelToken, rpsFactor, id) {
        const providers = this._reorderProvidersByNiceFactor();
        let data = undefined,
            providerIndex = 0,
            countOfRequestsDeclinedByRPS = 0,
            errors = [];
        while (!data && providerIndex < providers.length) {
            let provider = providers[providerIndex];
            const domain = getDomainWithoutSubdomains(provider.endpoint);
            if (provider.RPS && rpsEnsurer.isRPSExceeded(domain)) {
                /**
                 * Current provider's RPS is exceeded, so we try next provider. Also, we count such cases to make
                 * a decision about the force-retry need.
                 */
                ++providerIndex;
                ++countOfRequestsDeclinedByRPS;
                continue;
            }

            try {
                const axiosConfig = { ...(cancelToken ? { cancelToken } : {}), timeout: provider.timeout || timeoutMS };
                const httpMethods = Array.isArray(provider.httpMethod) ? provider.httpMethod : [provider.httpMethod];
                const iterationsData = [];
                for (let subRequestIndex = 0; subRequestIndex < httpMethods.length; ++subRequestIndex) {
                    const queryStringComposer = Array.isArray(provider.composeQueryString)
                        ? provider.composeQueryString[subRequestIndex]
                        : provider.composeQueryString;
                    const query = queryStringComposer.bind(provider)(parametersValues);
                    const endpoint = `${provider.endpoint}${query}`;
                    const axiosParams = [endpoint, axiosConfig];
                    if (["post", "put", "patch"].find(method => method === httpMethods[subRequestIndex])) {
                        const body = provider.composeBody ? provider.composeBody(parametersValues) : null;
                        axiosParams.splice(1, 0, body);
                    }

                    let pageNumber = 0;
                    const responsesForPages = [];
                    let hasNextPage = provider.checkWhetherResponseIsForLastPage != null;
                    do {
                        if (subRequestIndex === 0 && pageNumber === 0) {
                            rpsEnsurer.actualizeLastCalledTimestamp(domain, provider.RPS);
                            responsesForPages[pageNumber] = await axios[httpMethods[subRequestIndex]](...axiosParams);
                            externalServicesStatsCollector.externalServiceCalledWithoutError(provider.endpoint);
                        } else {
                            if (pageNumber > 0) {
                                let changer = provider.changeQueryParametersForPageNumber;
                                changer = Array.isArray(changer) ? changer[subRequestIndex] : changer;
                                const actualizedParams = changer.bind(provider)(
                                    parametersValues,
                                    responsesForPages[pageNumber - 1],
                                    pageNumber
                                );
                                const query = queryStringComposer.bind(provider)(actualizedParams);
                                axiosParams[0] = `${provider.endpoint}${query}`;
                            }
                            /**
                             * For requests starting from second one we postpone each request to not exceed RPS
                             * of current provider. We use rpsFactor to dynamically increase the rps to avoid
                             * too frequent calls if we continue failing to retrieve the data due to RPS exceeding.
                             * TODO: [dev] test RPS factor logic (units or integration)
                             */

                            const waitingTimeMS = provider.RPS ? 1000 / (provider.RPS / rpsFactor) : 0;

                            responsesForPages[pageNumber] = await postponeExecution(async () => {
                                rpsEnsurer.actualizeLastCalledTimestamp(domain, provider.RPS);
                                return await axios[httpMethods[subRequestIndex]](...axiosParams);
                            }, waitingTimeMS);
                        }

                        if (hasNextPage) {
                            let checker = provider.checkWhetherResponseIsForLastPage;
                            checker = Array.isArray(checker) ? checker[subRequestIndex] : checker;
                            hasNextPage = !checker.bind(provider)(
                                responsesForPages[pageNumber - 1],
                                responsesForPages[pageNumber],
                                pageNumber
                            );
                        }
                        pageNumber++;
                    } while (hasNextPage);

                    const responsesDataForPages = responsesForPages.map(response =>
                        provider.getDataByResponse(response, parametersValues)
                    );

                    let allData = responsesDataForPages;
                    if (Array.isArray(responsesDataForPages[0])) {
                        allData = responsesDataForPages.flat();
                    } else if (responsesDataForPages.length === 1) {
                        allData = responsesDataForPages[0];
                    }

                    allData && iterationsData.push(allData);
                }
                if (iterationsData.length) {
                    data = httpMethods.length > 1 ? iterationsData.flat() : iterationsData[0];
                } else {
                    externalServicesStatsCollector.externalServiceFailed(
                        provider.endpoint,
                        "Response data was null for some reason"
                    );
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
        const rpsMultiplier = shouldBeForceRetried ? RobustExternalAPICallerService.rpsMultiplier : 1;

        return { data: data ?? null, shouldBeForceRetried, rpsFactor: rpsFactor * rpsMultiplier, errors };
    }

    _reorderProvidersByNiceFactor() {
        const providersCopy = [...this.providers];

        return providersCopy.sort((p1, p2) => p2.niceFactor - p1.niceFactor);
    }
}

function punishProvider(provider) {
    provider.niceFactor = provider.niceFactor - 1;
}
