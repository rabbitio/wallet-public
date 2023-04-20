import { improveAndRethrow, logError } from "../../../common/utils/errorUtils";
import { EthereumBlockchainTransactionFeeProvider } from "../external-apis/ethereumBlockchainTransactionFeeProvider";
import { EthereumTransactionsHistoryService } from "./ethereumTransactionsHistoryService";

export class EthTransactionDetailsService {
    /**
     * Checks whether the given tx belongs to the coin in ethereum blockchain.
     *
     * @param coin {Coin} coin to check belonging for
     * @param txId {string} transaction hash string
     * @return {Promise<boolean>} resolves to true of the transaction belongs to the Ether
     */
    static async isTransactionBelongingToEthereumCoin(coin, txId) {
        try {
            const allCoinTxs = await EthereumTransactionsHistoryService.getEthereumTransactionsHistory(coin);
            const txs = allCoinTxs.filter(t => t.txid === txId);
            return (txs ?? []).length > 0;
        } catch (e) {
            logError(
                e,
                "isTransactionBelongsToEther",
                "We treat this error as that the checking tx is not belonging to ETH"
            );
            return false;
        }
    }

    /**
     * Returns details for ethereum blockchain transaction.
     * This method doesn't call for transaction details as services for other coins do. This is because actually
     * we have the transaction details already in the transactions history list except possibly fee value.
     *
     * When filtering transactions history by coin, id and type we still can get several transactions because each
     * transaction can contain plenty of internal transactions sending even the same amounts. Currently, our app
     * doesn't support displaying such transaction details, so we just return the first retrieved details item of the list.
     * TODO: [feature, moderate] task_id=1091423c08de4144ac82faa2db291943
     *
     * @param coin {Coin} coin to get txs for
     * @param txId {string} id of transaction
     * @param type {("in"|"out"|null)} type of the transaction or null
     * @return {Promise<TransactionsHistoryItem|null>} tx details or null if not found
     */
    static async getEthereumBlockchainTransactionDetails(coin, txId, type) {
        try {
            const allCoinTxs = await EthereumTransactionsHistoryService.getEthereumTransactionsHistory(coin);
            const txs = allCoinTxs.filter(t => t.txid === txId && (!type || t.type === type));
            const tx = (txs ?? [])[0] ?? null;
            if (tx && tx.confirmations > 0) {
                const fee = await EthereumBlockchainTransactionFeeProvider.getEthereumBlockchainTransactionFee(txId);
                fee != null && (tx.fees = fee);
            }
            return tx;
        } catch (e) {
            improveAndRethrow(e, "getEthereumBlockchainTransactionDetails");
        }
    }
}
