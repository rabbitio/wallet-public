import { improveAndRethrow, logError } from "../../../common/utils/errorUtils";
import { EthTransactionDetailsProvider } from "../external-apis/ethTransactionDetailsProvider";
import { EthAddressesService } from "./ethAddressesService";
import { EthTransactionsUtils } from "../lib/ethTransactionsUtils";

export class EthTransactionDetailsService {
    /**
     * Retrieves ethereum blockchain transaction details.
     * If passing transaction is related to some token or other transaction types than transfer between externally
     * owned accounts then you should take care about it manually.
     *
     * @param txId {string} id of transaction (hash)
     * @returns {Promise<TransactionsHistoryItem|null>} transaction details as universal object or null if tx is not found
     */
    static async getEthTransactionDetails(txId) {
        try {
            const address = EthAddressesService.getCurrentEthAddress();
            return await EthTransactionDetailsProvider.getEthTransactionDetails(txId, address);
        } catch (e) {
            improveAndRethrow(e, "getEthTransactionDetails");
        }
    }

    /**
     * Checks whether the given tx belongs to the Ether.
     *
     * @param txId {string} transaction hash string
     * @return {Promise<boolean>} resolves to true of the transaction belongs to the Ether
     */
    static async isTransactionBelongsToEther(txId) {
        try {
            const tx = await EthTransactionDetailsProvider.getEthTransactionDetails(txId);

            return EthTransactionsUtils.isEthereumTransactionAEtherTransfer(tx);
        } catch (e) {
            logError(
                e,
                "isTransactionBelongsToEther",
                "We treat this error as that the checking tx is not belonging to ETH"
            );
            return false;
        }
    }
}
