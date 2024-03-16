import { improveAndRethrow, Logger } from "@rabbitio/ui-kit";

import { performNoBatchTransactionsDataRetrieval } from "../../external-apis/noBatchTransactionsAPI.js";
import { performBatchTransactionsDataRetrieval } from "../../external-apis/batchTransactionsAPI.js";

export class TransactionsDataRetrieverService {
    static isBatchRetrievalModeWorkingRightNow() {
        return true; // Change to false if disabling batch mode
    }

    /**
     * Retrieves transactions by addresses. First tries batch retriever for the fastest result.
     * If it fails tries to retrieve transactions per address.
     *
     * @param addresses {string[]} addresses array to get transactions for
     * @param network {Network} network to get transactions in. Should correspond to the addresses.
     * @param cancelProcessingHolder {CancelProcessing} optional operation canceler to avoid redundant requests
     * @param addressesUpdateTimestampsVariableParameter {any[]}
     * @param [maxAttemptsCountToGetDataForEachAddress] {number} max attempts for trying to get transactions by address (if batch retrieval failed)
     * @return {Promise<Transaction[]>}
     */
    static async performTransactionsRetrieval(
        addresses,
        network,
        cancelProcessingHolder,
        addressesUpdateTimestampsVariableParameter,
        maxAttemptsCountToGetDataForEachAddress = 1
    ) {
        const loggerSource = "performTransactionsRetrieval";
        try {
            try {
                return await performBatchTransactionsDataRetrieval(
                    addresses,
                    network,
                    cancelProcessingHolder,
                    addressesUpdateTimestampsVariableParameter
                );
            } catch (e) {
                Logger.log("Failed to get btc transactions using batch API: " + JSON.stringify(e), loggerSource);

                return await performNoBatchTransactionsDataRetrieval(
                    addresses,
                    network,
                    cancelProcessingHolder,
                    addressesUpdateTimestampsVariableParameter,
                    maxAttemptsCountToGetDataForEachAddress
                );
            }
        } catch (e) {
            Logger.log("Failed to get btc transactions using no-batch API: " + JSON.stringify(e), loggerSource);
            improveAndRethrow(e, "performTransactionsRetrieval");
        }
    }
}
