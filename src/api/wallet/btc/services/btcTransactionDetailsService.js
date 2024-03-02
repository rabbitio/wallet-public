import { improveAndRethrow } from "@rabbitio/ui-kit";

import { logError } from "../../../common/utils/errorUtils.js";
import { transactionsDataProvider } from "./internal/transactionsDataProvider.js";
import { BtcTransactionDetailsProvider } from "../external-apis/transactionDataAPI.js";
import { Storage } from "../../../common/services/internal/storage.js";

export class BtcTransactionDetailsService {
    /**
     * Composes BTC transaction details
     *
     * @param txId {string} id of transaction
     * @return {Promise<TransactionsHistoryItem|null>} transaction details object
     */
    static async getBTCTransactionDetails(txId) {
        try {
            return await transactionsDataProvider.getTransactionData(txId);
        } catch (e) {
            improveAndRethrow(e, "getBTCTransactionDetails");
        }
    }

    /**
     * Checks whether transaction belongs to bitcoin blockchain (given network)
     *
     * @param txId {string} id of the transaction
     * @return {Promise<boolean>} true if the transaction is from the given bitcoin network, false otherwise
     */
    static async isTransactionBelongsToBitcoin(txId) {
        try {
            const tx = await BtcTransactionDetailsProvider.retrieveTransactionData(txId, Storage.getCurrentNetwork());

            return !!tx;
        } catch (e) {
            logError(
                e,
                "isTransactionBelongsToBitcoin",
                "We treat this error as that the checking tx is not belonging to BTC"
            );
            return false;
        }
    }
}
