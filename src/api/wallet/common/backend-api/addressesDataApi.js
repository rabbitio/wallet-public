import { improveAndRethrow, CacheAndConcurrentRequestsResolver } from "@rabbitio/ui-kit";

import { ApiCallWrongResponseError, doApiCall, urlWithPrefix } from "../../../common/backend-api/utils.js";
import { PERMANENT_TTL_FOR_RARE_CHANGING_DATA_MS } from "../../../common/utils/ttlConstants.js";
import { cache } from "../../../common/utils/cache.js";

export default class AddressesDataApi {
    static serverEndpointEntity = "addressesData";

    static async getAddressesData(walletId) {
        try {
            const errorMessage = "Failed to get addresses data from server. ";
            const url = `${urlWithPrefix}/${this.serverEndpointEntity}/${walletId}/addresses`;

            return await doApiCall(url, "get", null, 200, errorMessage);
        } catch (e) {
            improveAndRethrow(e, "getAddressesData");
        }
    }

    static async deleteAddressData(walletId, addressUUID) {
        try {
            if (typeof addressUUID !== "string" || addressUUID === "") {
                throw new Error("Pass correct params - not empty string walletId and not empty string addressUUID. ");
            }

            const errorMessage = "Failed to delete address data on server. ";
            const url = `${urlWithPrefix}/${this.serverEndpointEntity}/${walletId}/addresses/${addressUUID}`;
            await doApiCall(url, "delete", null, 204, errorMessage);

            return "ok";
        } catch (e) {
            if (e instanceof ApiCallWrongResponseError && e.isNotFoundError()) {
                return null;
            }

            improveAndRethrow(e, "deleteAddressData");
        }
    }

    static async updateAddressData(walletId, addressUUID, addressData) {
        try {
            if (
                typeof addressUUID !== "string" ||
                addressUUID === "" ||
                typeof addressData !== "string" ||
                addressData === ""
            ) {
                throw new Error(
                    "Pass correct params - not empty string walletId and not empty addressUUID and not empty addressData. "
                );
            }

            const errorMessage = "Failed to update address data on server. ";
            const data = { addressData };
            const url = `${urlWithPrefix}/${this.serverEndpointEntity}/${walletId}/addresses/${addressUUID}`;
            await doApiCall(url, "patch", data, 200, errorMessage);

            return "ok";
        } catch (e) {
            if (e instanceof ApiCallWrongResponseError && e.isNotFoundError()) {
                return null;
            }

            improveAndRethrow(e, "updateAddressData");
        }
    }

    static addressesIndexesCacheKey = "90a35f1b-14a9-4eb6-9cb2";
    static _cacheAndRequestsResolver = new CacheAndConcurrentRequestsResolver(
        "addressesIndexesResolver",
        cache,
        PERMANENT_TTL_FOR_RARE_CHANGING_DATA_MS, // TODO: [refactoring, moderate] Since 0.8.3 we don't support new addresses creation so the indexes are always the same. Refactoring required. task_id=546c83e7f4b64f39b67055a7c4ecaa48
        false
    );

    /**
     * Gets indexes for addresses paths.
     *
     * @return Promise resolving to array of { path: string, index: number }
     */
    static async getAddressesIndexes(walletId) {
        let cached;
        try {
            cached = await this._cacheAndRequestsResolver.getCachedOrWaitForCachedOrAcquireLock(
                this.addressesIndexesCacheKey
            );
            if (!cached?.canStartDataRetrieval) {
                return cached?.cachedData;
            }
            const errorMessage = "Failed to get address indexes. ";
            const endpoint = `${urlWithPrefix}/addressesData/${walletId}/indexes`;

            const result = await doApiCall(endpoint, "get", null, 200, errorMessage);
            this._cacheAndRequestsResolver.saveCachedData(this.addressesIndexesCacheKey, cached?.lockId, result);
            return result;
        } catch (e) {
            improveAndRethrow(e, "getAddressesIndexes");
        } finally {
            this._cacheAndRequestsResolver.releaseLock(this.addressesIndexesCacheKey, cached?.lockId);
        }
    }

    /**
     * Increments address index with given incrementWith value for specified derivation path.
     *
     * @param walletId - id of wallet to increment the index for
     * @param path - path to increment the index for
     * @param incrementWith - value to increment the index with
     * @param baseIndex - base index to add increment value to
     * @return Promise resolving to void
     */
    static async incrementAddressesIndexOnServer(walletId, path, incrementWith, baseIndex) {
        try {
            this._cacheAndRequestsResolver.invalidate(this.addressesIndexesCacheKey);
            const endpoint = `${urlWithPrefix}/addressesData/${walletId}/indexes`;
            const errorMessage = "Failed to increment address index.";
            const data = { path, newIndexValue: baseIndex + incrementWith };

            return await doApiCall(endpoint, "patch", data, 204, errorMessage);
        } catch (e) {
            improveAndRethrow(e, "incrementAddressesIndexOnServer");
        }
    }

    /**
     * Increments address index for specified derivation path and saves given addresses data.
     *
     * @param walletId - id of wallet to increment the index for
     * @param path - path to increment the index for
     * @param addressesData - array of objects: { uuid: string, encryptedAddressData: string }, min length is 1
     * @param baseIndex - base index to add increment value to
     * @return Promise resolving to void
     */
    static async incrementAddressesIndexAndSaveAddressesData(walletId, path, addressesData, baseIndex) {
        try {
            this._cacheAndRequestsResolver.invalidate(this.addressesIndexesCacheKey);
            const endpoint = `${urlWithPrefix}/addressesData/${walletId}`;
            const errorMessage = "Failed to increment address index and save addresses.";
            const data = { path, addressesData, baseIndex };

            return await doApiCall(endpoint, "patch", data, 204, errorMessage);
        } catch (e) {
            improveAndRethrow(e, "incrementAddressesIndexAndSaveAddressesData");
        }
    }
}
