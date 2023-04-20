import axios from "axios";
import { getLogger } from "log4js";

/**
 * Template service needed to avoid duplication of the same logic when we need to call
 * external API to retrieve some data. We are using several API providers here so if one fails
 * we just try another.
 */
export default class RobustExternalAPICallerService {
    log = getLogger("robustExternalAPICallerService");

    /**
     * TODO: [refactoring, moderate] use classes instead of passing objects
     * @param providersData - Array of objects of following format:
     *     {
     *         endpoint: string,
     *         httpMethod: string, // get, post, put, delete, patch
     *         composeQueryString: function accepting array of values for query parameters,
     *         getDataByResponse: function accepting response object and parameters array and extracting required data from it
     *     }
     */
    constructor(providersData) {
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
    }

    /**
     * Performs data retrieval from external APIs. Tries providers till the data is retrieved.
     *
     * @param queryParametersValues - Array of values of the parameters for URL query string
     * @param timeoutMS - http timeout to wait for response
     * @return Promise resolving to retrieved data
     * @throws Error if requests to all providers are failed
     */
    async callExternalAPI(queryParametersValues = [], timeoutMS = 3500) {
        this._reorderProvidersByNiceFactor();
        let data = undefined,
            providerIndex = 0,
            errors = [];
        while (!data && providerIndex < this.providers.length) {
            const provider = this.providers[providerIndex];
            const endpoint = `${provider.endpoint}${provider.composeQueryString(queryParametersValues)}`;
            try {
                let params = [];
                const axiosConfig = { timeout: provider.timeout || timeoutMS };
                if (
                    provider.httpMethod === "post" ||
                    provider.httpMethod === "put" ||
                    provider.httpMethod === "patch"
                ) {
                    params = [
                        endpoint,
                        provider.composeBody ? provider.composeBody(queryParametersValues) : null,
                        axiosConfig,
                    ];
                } else {
                    params = [endpoint, axiosConfig];
                }
                const response = await axios[provider.httpMethod](...params);
                data = provider.getDataByResponse(response, queryParametersValues);
                !data && punishProvider(provider);
            } catch (e) {
                punishProvider(provider);
                this.log.error(e, "callExternalAPI", `Failed provider: ${provider.endpoint}`);
                errors.push(e);
            } finally {
                providerIndex++;
            }
        }

        if (data === undefined && errors.length) {
            throw new Error(`Failed to call API. All errors are: ${JSON.stringify(errors)}.`);
        }

        return data;
    }

    _reorderProvidersByNiceFactor() {
        this.providers = this.providers.sort((p1, p2) => p2.niceFactor - p1.niceFactor);
    }
}

function punishProvider(provider) {
    provider.niceFactor = provider.niceFactor - 1;
}
