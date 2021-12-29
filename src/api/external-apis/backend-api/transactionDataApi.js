import { improveAndRethrow } from "../../utils/errorUtils";
import { ApiCallWrongResponseError } from "./utils";
import { doApiCall, urlWithPrefix } from "./utils";

// TODO: [tests, moderate] Implement unit tests
export async function saveTransactionDataToServerForCurrentWallet(transactionIdHash, transactionData) {
    transactionData["transactionIdHash"] = transactionIdHash;
    const endpoint = `${urlWithPrefix}/transactionsData`;

    return doApiCall(endpoint, "post", transactionData, 201, "Failed to save transactions data. ");
}

export async function getTransactionsDataFromServerForCurrentWallet(transactionIdHashes) {
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

export async function updateTransactionDataOnServerForCurrentWallet(transactionIdHash, transactionData) {
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
