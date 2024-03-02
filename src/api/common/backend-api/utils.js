import Cookie from "js-cookie";

import { improveAndRethrow } from "@rabbitio/ui-kit";

import { API_URL, IS_TESTING } from "../../../properties.js";
import { cookieStorage } from "../utils/cookiesStorage.js";
import { EventBus, NO_AUTHENTICATION_EVENT } from "../adapters/eventbus.js";
import { Storage } from "../services/internal/storage.js";
import { WALLET_EXISTS } from "./apiErrorCodes.js";
import { postponeExecution, safeStringify } from "../utils/browserUtils.js";
import AxiosAdapter from "../adapters/axiosAdapter.js";

export const API_VERSION_PREFIX = "/api/v1";
export const urlWithPrefix = `${API_URL}${API_VERSION_PREFIX}`;
export const API_KEYS_PROXY_URL = `${API_URL}${API_VERSION_PREFIX}/proxy`;

export const SESSION_COOKIE_NAME = "sessionId";

export async function doApiCall(
    endpoint,
    method,
    data,
    successStatuses,
    errorMessage,
    options = { doPostEventOnNotAuthenticated: true, ipHash: null, headers: {} }
) {
    try {
        endpoint = await addIpHashParameterToUrl(endpoint, options.ipHash);
        // IS_TESTING is used as a workaround for integration testing
        const headers =
            (IS_TESTING && { Cookie: cookieStorage.getSavedCookieHeader(), ...options.headers }) || options.headers;

        let response;
        if (method === "get") {
            response = await AxiosAdapter.get(endpoint, { headers });
        } else if (method === "post") {
            response = await AxiosAdapter.post(endpoint, data, { headers });
        } else if (method === "put") {
            response = await AxiosAdapter.put(endpoint, data, { headers });
        } else if (method === "patch") {
            response = await AxiosAdapter.patch(endpoint, data, { headers });
        } else if (method === "delete") {
            const config = { headers };
            data && (config.data = data);
            response = await AxiosAdapter.delete(endpoint, config);
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
                !IS_TESTING && Cookie.remove(SESSION_COOKIE_NAME);
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
                    ? Storage.getCurrentIpHash()
                    : await postponeExecution(Storage.getCurrentIpHash, 1000);
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
