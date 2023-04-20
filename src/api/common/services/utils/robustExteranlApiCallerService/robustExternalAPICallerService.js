import axios from "axios";

import { postponeExecution, safeStringify } from "../../../utils/browserUtils";
import { improveAndRethrow, logError } from "../../../utils/errorUtils";
import { externalServicesStatsCollector } from "./externalServicesStatsCollector";
import { concurrentCalculationsMetadataHolder } from "../../internal/concurrentCalculationsMetadataHolder";

/**
 * TODO: [refactoring, critical] update backend copy of this service. Also there is a task to extract this
 *                               service and other related to it stuff to dedicated npm package task_id=b008ee5e4a3f42c08c73831c4bb3db4e
 *
 * Template service needed to avoid duplication of the same logic when we need to call
 * external APIs to retrieve some data. The idea is to use several API providers to retrieve the same data. It helps to
 * improve the reliability of a data retrieval.
 */
export default class RobustExternalAPICallerService {
    /**
     * @param bio {string} service name for logging
     * @param providersData {ExternalApiProvider[]} array of providers
     * @param [logger] {function} function to be used for logging
     */
    constructor(bio, providersData, logger = logError) {
        providersData.forEach(provider => {
            if ((!provider.endpoint && provider.endpoint !== "") || !provider.httpMethod) {
                throw new Error(`Wrong format of providers data for: ${JSON.stringify(provider)}`);
            }
        });

        // We add niceFactor - just number to order the providers array by. It is helpful to call
        // less robust APIs only if more robust fails
        this.providers = providersData;
        providersData.forEach(provider => provider.resetNiceFactor());
        this.bio = bio;
        this._logger = logError;
    }

    static defaultRPSFactor = 1;
    static rpsMultiplier = 1.05;

    /**
     * Performs data retrieval from external APIs. Tries providers till the data is retrieved.
     *
     * @param parametersValues {array} array of values of the parameters for URL query string [and/or body]
     * @param timeoutMS {number} http timeout to wait for response. If provider has its specific timeout value then it is used
     * @param [cancelToken] {object|undefined} axios token to force-cancel requests from high-level code
     * @param [attemptsCount] {number|undefined} number of attempts to be performed
     * @param [doNotFailForNowData] {boolean|undefined} pass true if you do not want us to throw an error if we retrieved null data from all the providers
     * @return {Promise<any>} resolving to retrieved data (or array of results if specific provider requires
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
        const calculationUuid = concurrentCalculationsMetadataHolder.startCalculation(this.bio);

        try {
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
                        result = await this._performCallAttempt(
                            parametersValues,
                            timeoutMS,
                            cancelToken,
                            rpsFactor,
                            doNotFailForNowData
                        );
                    } else {
                        const maxRps = Math.max(...this.providers.map(provider => provider.getRps() ?? 0));
                        const waitingTimeMs = maxRps ? 1000 / (maxRps / rpsFactor) : 0;

                        result = await new Promise((resolve, reject) => {
                            setTimeout(async () => {
                                try {
                                    resolve(
                                        await this._performCallAttempt(
                                            parametersValues,
                                            timeoutMS,
                                            cancelToken,
                                            rpsFactor,
                                            doNotFailForNowData
                                        )
                                    );
                                } catch (e) {
                                    reject(e);
                                }
                            }, waitingTimeMs);
                        });
                    }
                    if (result.errors?.length) {
                        const errors = result.errors;
                        this._logger(
                            new Error(
                                `Failed at attempt ${i}. ${errors.length} errors. Messages: ${safeStringify(
                                    errors.map(error => error.message)
                                )}: ${safeStringify(errors)}.`
                            ),
                            `${this.bio}.callExternalAPI`,
                            "",
                            true
                        );
                    }
                } catch (e) {
                    this._logger(e, `${this.bio}.callExternalAPI`, "Failed to perform external providers calling");
                }
            }

            if (result?.data == null) {
                // TODO: [feature, moderate] looks like we should not fail for null data as it is strange - the provider will fail when processing data internally
                const error = new Error(
                    `Failed to retrieve data. It means all attempts have been failed. DEV: add more attempts to this data retrieval`
                );
                if (!doNotFailForNowData) {
                    throw error;
                } else {
                    this._logger(error, `${this.bio}.callExternalAPI`);
                }
            }

            return result?.data;
        } catch (e) {
            improveAndRethrow(e, `${this.bio}.callExternalAPI`);
        } finally {
            concurrentCalculationsMetadataHolder.endCalculation(this.bio, calculationUuid);
        }
    }

    async _performCallAttempt(parametersValues, timeoutMS, cancelToken, rpsFactor, doNotFailForNowData) {
        const providers = this._reorderProvidersByNiceFactor();
        let data = undefined,
            providerIndex = 0,
            countOfRequestsDeclinedByRps = 0,
            errors = [];
        while (!data && providerIndex < providers.length) {
            let provider = providers[providerIndex];
            if (provider.isRpsExceeded()) {
                /**
                 * Current provider's RPS is exceeded, so we try next provider. Also, we count such cases to make
                 * a decision about the force-retry need.
                 */
                ++providerIndex;
                ++countOfRequestsDeclinedByRps;
                continue;
            }

            try {
                const axiosConfig = {
                    ...(cancelToken ? { cancelToken } : {}),
                    timeout: provider.timeout || timeoutMS,
                    headers: provider.specificHeaders ?? {},
                };
                const httpMethods = Array.isArray(provider.httpMethod) ? provider.httpMethod : [provider.httpMethod];
                const iterationsData = [];
                for (let subRequestIndex = 0; subRequestIndex < httpMethods.length; ++subRequestIndex) {
                    const query = provider.composeQueryString(parametersValues, subRequestIndex);
                    const endpoint = `${provider.endpoint}${query}`;
                    const axiosParams = [endpoint, axiosConfig];
                    if (["post", "put", "patch"].find(method => method === httpMethods[subRequestIndex])) {
                        const body = provider.composeBody(parametersValues, subRequestIndex) ?? null;
                        axiosParams.splice(1, 0, body);
                    }

                    let pageNumber = 0;
                    const responsesForPages = [];
                    let hasNextPage = provider.doesSupportPagination();
                    do {
                        if (subRequestIndex === 0 && pageNumber === 0) {
                            provider.actualizeLastCalledTimestamp();
                            responsesForPages[pageNumber] = await axios[httpMethods[subRequestIndex]](...axiosParams);
                            externalServicesStatsCollector.externalServiceCalledWithoutError(provider.getApiGroupId());
                        } else {
                            if (pageNumber > 0) {
                                const actualizedParams = provider.changeQueryParametersForPageNumber(
                                    parametersValues,
                                    responsesForPages[pageNumber - 1],
                                    pageNumber,
                                    subRequestIndex
                                );
                                const query = provider.composeQueryString(actualizedParams, subRequestIndex);
                                axiosParams[0] = `${provider.endpoint}${query}`;
                            }
                            /**
                             * For second and more request we postpone each request to not exceed RPS
                             * of current provider. We use rpsFactor to dynamically increase the rps to avoid
                             * too frequent calls if we continue failing to retrieve the data due to RPS exceeding.
                             * TODO: [dev] test RPS factor logic (units or integration)
                             */

                            const waitingTimeMS = provider.getRps() ? 1000 / (provider.getRps() / rpsFactor) : 0;

                            responsesForPages[pageNumber] = await postponeExecution(async () => {
                                provider.actualizeLastCalledTimestamp();
                                return await axios[httpMethods[subRequestIndex]](...axiosParams);
                            }, waitingTimeMS);
                        }

                        if (hasNextPage) {
                            hasNextPage = !provider.checkWhetherResponseIsForLastPage(
                                responsesForPages[pageNumber - 1],
                                responsesForPages[pageNumber],
                                pageNumber,
                                subRequestIndex
                            );
                        }
                        pageNumber++;
                    } while (hasNextPage);

                    const responsesDataForPages = responsesForPages.map(response =>
                        provider.getDataByResponse(response, parametersValues, subRequestIndex, iterationsData)
                    );

                    let allData = responsesDataForPages;
                    if (Array.isArray(responsesDataForPages[0])) {
                        allData = responsesDataForPages.flat();
                    } else if (responsesDataForPages.length === 1) {
                        allData = responsesDataForPages[0];
                    }

                    iterationsData.push(allData);
                }
                if (iterationsData.length) {
                    if (httpMethods.length > 1) {
                        data = provider.incorporateIterationsData(iterationsData);
                    } else {
                        data = iterationsData[0];
                    }
                } else if (!doNotFailForNowData) {
                    externalServicesStatsCollector.externalServiceFailed(
                        provider.getApiGroupId(),
                        "Response data was null for some reason"
                    );
                    punishProvider(provider);
                }
            } catch (e) {
                punishProvider(provider);
                externalServicesStatsCollector.externalServiceFailed(provider.getApiGroupId(), e?.message);
                errors.push(e);
            } finally {
                providerIndex++;
            }
        }

        // If we are declining more than 50% of providers (by exceeding RPS) then we note that it better to retry the whole process of providers requesting
        const shouldBeForceRetried = data == null && countOfRequestsDeclinedByRps > Math.floor(providers.length * 0.5);
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
