import { improveAndRethrow } from "@rabbitio/ui-kit";

import { ApiCallWrongResponseError, doApiCall, urlWithPrefix } from "../../../common/backend-api/utils.js";

// TODO: [tests, moderate] Implement unit tests
export class TransactionDataApi {
    static async saveTransactionDataToServerForCurrentWallet(transactionIdHash, transactionData) {
        try {
            transactionData["transactionIdHash"] = transactionIdHash;
            const endpoint = `${urlWithPrefix}/transactionsData`;

            return doApiCall(endpoint, "post", transactionData, 201, "Failed to save transactions data. ");
        } catch (e) {
            improveAndRethrow(e, "saveTransactionDataToServerForCurrentWallet");
        }
    }

    static async getTransactionsDataFromServerForCurrentWallet(transactionIdHashes) {
        try {
            if (Array.isArray(transactionIdHashes)) {
                transactionIdHashes = transactionIdHashes.join(",");
            }

            if (!transactionIdHashes) {
                return [];
            }

            const endpoint = `${urlWithPrefix}/transactionsData/get`;
            const errorMessage = "Failed to get transactions data.";
            return await doApiCall(endpoint, "post", { transactionIdHashes: transactionIdHashes }, 200, errorMessage);
        } catch (e) {
            if (e instanceof ApiCallWrongResponseError && e.isNotFoundError()) {
                return [];
            }

            improveAndRethrow(e, "getTransactionsDataFromServerForCurrentWallet");
        }
    }

    static async updateTransactionDataOnServerForCurrentWallet(transactionIdHash, transactionData) {
        try {
            transactionData["transactionIdHash"] = transactionIdHash;
            const endpoint = `${urlWithPrefix}/transactionsData`;

            return await doApiCall(endpoint, "put", transactionData, 200, "Failed to update transactions data. ");
        } catch (e) {
            if (e instanceof ApiCallWrongResponseError && e.isNotFoundError()) {
                return "not_found";
            }

            improveAndRethrow(e, "updateTransactionDataOnServerForCurrentWallet");
        }
    }
}
