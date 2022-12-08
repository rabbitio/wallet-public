import { improveAndRethrow, logError } from "../../../common/utils/errorUtils";
import { transactionsDataProvider } from "./internal/transactionsDataProvider";
import AddressesServiceInternal from "./internal/addressesServiceInternal";
import { getExtendedTransactionDetails } from "../lib/transactions/transactions-history";
import { retrieveTransactionData } from "../external-apis/transactionDataAPI";
import { getCurrentNetwork } from "../../../common/services/internal/storage";

export class BtcTransactionDetailsService {
    /**
     * Composes BTC transaction details
     *
     * @param txId {string} id of transaction
     * @return {Promise<TransactionsHistoryItem|null>} transaction details object
     */
    static async getBTCTransactionDetails(txId) {
        try {
            const [transaction, addresses] = await Promise.all([
                transactionsDataProvider.getTransactionData(txId),
                AddressesServiceInternal.getAllUsedAddresses(),
            ]);

            if (transaction) {
                return getExtendedTransactionDetails(transaction, addresses);
            }

            return null;
        } catch (e) {
            improveAndRethrow(e);
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
            const tx = await retrieveTransactionData(txId, getCurrentNetwork());

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
