import is from "is_js";

import { ApiCallWrongResponseError, doApiCall, urlWithPrefix } from "./utils";
import { improveAndRethrow } from "../../utils/errorUtils";

export default class AddressesDataApi {
    static serverEndpointEntity = "addressesData";

    static async getAddressesData(walletId) {
        try {
            const errorMessage = "Failed to get addresses data from server. ";
            const url = `${urlWithPrefix}/${this.serverEndpointEntity}/${walletId}/addresses`;

            return await doApiCall(url, "get", null, 200, errorMessage);
        } catch (e) {
            improveAndRethrow(e, AddressesDataApi.deleteAddressData);
        }
    }

    static async deleteAddressData(walletId, addressUUID) {
        try {
            if (is.empty(addressUUID) || is.not.string(addressUUID)) {
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

            improveAndRethrow(e, AddressesDataApi.deleteAddressData);
        }
    }

    static async updateAddressData(walletId, addressUUID, addressData) {
        try {
            if (
                is.not.string(addressUUID) ||
                is.empty(addressUUID) ||
                is.not.string(addressData) ||
                is.empty(addressData)
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

            improveAndRethrow(e, AddressesDataApi.deleteAddressData);
        }
    }

    /**
     * Gets indexes for addresses paths.
     *
     * @return Promise resolving to array of { path: string, index: number }
     */
    static async getAddressesIndexes(walletId) {
        try {
            const errorMessage = "Failed to get address indexes. ";
            const endpoint = `${urlWithPrefix}/addressesData/${walletId}/indexes`;

            return await doApiCall(endpoint, "get", null, 200, errorMessage);
        } catch (e) {
            improveAndRethrow(e, "getAddressesIndexes");
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
            const endpoint = `${urlWithPrefix}/addressesData/${walletId}`;
            const errorMessage = "Failed to increment address index and save addresses.";
            const data = { path, addressesData, baseIndex };

            return await doApiCall(endpoint, "patch", data, 204, errorMessage);
        } catch (e) {
            improveAndRethrow(e, "incrementAddressesIndexAndSaveAddressesData");
        }
    }
}
