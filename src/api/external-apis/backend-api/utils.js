import axios from "axios";

import { API_URL, IS_TESTING } from "../../../properties";
import { cookieStorage } from "../../utils/cookiesStorage";
import { EventBus, NO_AUTHENTICATION_EVENT } from "../../adapters/eventbus";
import { improveAndRethrow } from "../../utils/errorUtils";
import { getCurrentIpHash } from "../../services/internal/storage";
import { WALLET_EXISTS } from "./apiErrorCodes";
import { postponeExecution, safeStringify } from "../../utils/browserUtils";

export const API_VERSION_PREFIX = "/api/v1";
export const urlWithPrefix = `${API_URL}${API_VERSION_PREFIX}`;

export async function doApiCall(
    endpoint,
    method,
    data,
    successStatuses,
    errorMessage,
    options = { doPostEventOnNotAuthenticated: true, ipHash: null }
) {
    try {
        endpoint = await addIpHashParameterToUrl(endpoint, options.ipHash);
        const headers = (IS_TESTING && { Cookie: cookieStorage.getSavedCookieHeader() }) || {}; // Workaround for integration testing
        let response;
        if (method === "get") {
            response = await axios.get(endpoint, { headers });
        } else if (method === "post") {
            response = await axios.post(endpoint, data, { headers });
        } else if (method === "put") {
            response = await axios.put(endpoint, data, { headers });
        } else if (method === "patch") {
            response = await axios.patch(endpoint, data, { headers });
        } else if (method === "delete") {
            const config = { headers };
            data && (config.data = data);
            response = await axios.delete(endpoint, config);
        }

        IS_TESTING && cookieStorage.saveCookiesLocally(response); // Workaround for integration testing

        if (
            response.status === successStatuses ||
            (Array.isArray(successStatuses) && successStatuses.filter(status => status === response.status))
        ) {
            return response.data || "ok";
        }

        const wrongStatusError = new Error(`Unexpected HTTP Status: ${response.status}. ${errorMessage}`);
        wrongStatusError.response = response;
        throw wrongStatusError;
    } catch (e) {
        if (e && e.response) {
            if (
                (Array.isArray(successStatuses) && successStatuses.includes(e.response.status)) ||
                successStatuses === e.response.status
            ) {
                return null;
            }

            const apiCallError = new ApiCallWrongResponseError(e.response, e.message);
            if (apiCallError.isForbiddenError() && options.doPostEventOnNotAuthenticated) {
                EventBus.dispatch(NO_AUTHENTICATION_EVENT, null, { error: e });
            }

            throw apiCallError;
        }

        improveAndRethrow(e, "doApiCall", errorMessage);
    }
}

async function addIpHashParameterToUrl(url, ipHash = null, waitNSecondsForIPHash = 10) {
    try {
        let iterations = waitNSecondsForIPHash;
        while (iterations > 0 && !ipHash) {
            ipHash =
                iterations === waitNSecondsForIPHash
                    ? getCurrentIpHash()
                    : await postponeExecution(getCurrentIpHash, 1000);
            --iterations;
        }

        if (!ipHash) {
            throw new Error("Ip hash is empty. Cannot add it to url. ");
        }

        const separator = (url.match(/^[^?]+\?[^?]+/g) && "&") || (url.match(/^[^?]+\?$/g) && "") || "?";

        return `${url}${separator}clientIpHash=${ipHash}`;
    } catch (e) {
        improveAndRethrow(e, "addIpHashParameterToUrl");
    }
}

export class ApiCallWrongResponseError {
    constructor(response, message = "") {
        this.serializedResponse = (() => {
            try {
                return safeStringify(response);
            } catch (e) {}
        })();

        this.httpStatus = response.status || null;
        if (response.data) {
            this.serverErrorDescription = response.data.description || null;
            this.serverHowToFix = response.data.howToFix || null;
            this.errorCodeInternal = response.data.errorCodeInternal || null;

            if (this.httpStatus && +this.httpStatus === 403) {
                if (response.data.authenticationError) {
                    this.authenticationError = response.data.authenticationError;
                }

                if (response.data.authorizationError) {
                    this.authorizationError = response.data.authorizationError;
                }
            }
        }
        this.message = message;
    }

    isForbiddenError() {
        return this.httpStatus && +this.httpStatus === 403;
    }

    isNotFoundError() {
        return this.httpStatus && +this.httpStatus === 404;
    }

    isWalletExistError() {
        return this.errorCodeInternal && +this.errorCodeInternal === WALLET_EXISTS;
    }
}
