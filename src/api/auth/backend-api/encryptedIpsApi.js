import { improveAndRethrow } from "@rabbitio/ui-kit";

import { ApiCallWrongResponseError, doApiCall, urlWithPrefix } from "../../common/backend-api/utils.js";

// TODO: [tests, moderate] Implement unit tests
/**
 * Saves encrypted IP.
 *
 * @param walletId - id of wallet (actually not used as it will be taken from cookies on server) TODO: [refactoring, moderate] fix it - remove parameter and fix method name
 * @param encryptedIp - encrypted IP address
 * @param ipHash - hash of IP (to check equality on server)
 * @returns Promise resolving to "ok"
 */
export async function saveEncryptedIpAddress(walletId, encryptedIp, ipHash) {
    try {
        const errorMessage = "Failed to save encrypted IP address. ";
        const data = { encryptedIp, ipHash };

        return await doApiCall(`${urlWithPrefix}/encryptedIps`, "post", data, 201, errorMessage);
    } catch (e) {
        improveAndRethrow(e, "saveEncryptedIpAddress");
    }
}

/**
 * Deletes encrypted IP addresses.
 *
 * @param walletId - id of wallet (actually not used as it will be taken from cookies on server) TODO: [refactoring, moderate] fix it - remove parameter and fix method name
 * @param ipHashes - array of hashes of IPs that should be removed
 * @returns Promise resolving to "ok"
 */
export async function deleteEncryptedIpAddresses(walletId, ipHashes) {
    try {
        const errorMessage = "Failed to delete IP addresses. ";
        const data = { ipHashes };

        await doApiCall(`${urlWithPrefix}/encryptedIps`, "delete", data, 204, errorMessage);
    } catch (e) {
        improveAndRethrow(e, "deleteEncryptedIpAddresses");
    }
}

/**
 * Returns all ip encrypted addresses for given walletId (sorted by creation date desc).
 *
 * @param walletId - id of wallet (actually not used as it will be taken from cookies on server) TODO: [refactoring, moderate] fix it - remove parameter and fix method name
 * @returns Promise resolving to array of encrypted IPs
 */
export async function getAllEncryptedIpAddresses(walletId) {
    try {
        const errorMessage = "Failed to get all encrypted IP addresses. ";
        const endpoint = `${urlWithPrefix}/encryptedIps`;

        const data = await doApiCall(endpoint, "get", null, 200, errorMessage);

        return data.encryptedIps;
    } catch (e) {
        if (e instanceof ApiCallWrongResponseError && e.isNotFoundError()) {
            return [];
        }

        improveAndRethrow(e, "getAllEncryptedIpAddresses");
    }
}

/**
 * Checks whether given IP hash present on server.
 *
 * @param walletId - id of wallet (actually not used as it will be taken from cookies on server) TODO: [refactoring, moderate] fix it - remove parameter and fix method name
 * @param ipHash - hash of ip to check presence on server for
 * @returns Promise resolving to true or false (ip hash present or not respectively)
 */
export async function isIpHashPresent(walletId, ipHash) {
    try {
        const errorMessage = "Failed to check given IP hash. ";
        const endpoint = `${urlWithPrefix}/encryptedIps?ipHash=${ipHash}`;

        await doApiCall(endpoint, "get", null, 200, errorMessage);

        return true;
    } catch (e) {
        if (e instanceof ApiCallWrongResponseError && e.isNotFoundError()) {
            return false;
        }

        improveAndRethrow(e, "isIpHashPresent");
    }
}
