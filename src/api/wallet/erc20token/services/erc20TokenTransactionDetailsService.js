import { improveAndRethrow, logError } from "../../../common/utils/errorUtils";
import { EthTransactionDetailsService } from "../../eth/services/ethTransactionDetailsService";
import { Erc20transactionUtils } from "../lib/erc20transactionUtils";

export class Erc20TokenTransactionDetailsService {
    /**
     * Retrieves the ERC20 transaction details.
     *
     * @param coin {Coin} coin the tx belongs to
     * @param txId {string} id of transaction (hash)
     * @returns {Promise<TransactionsHistoryItem>} history item
     */
    static async getErc20TransactionDetails(coin, txId) {
        try {
            const ethTxItem = await EthTransactionDetailsService.getEthTransactionDetails(txId);

            if (!Erc20transactionUtils.isEthereumTransactionErc20TokenTransfer(coin, ethTxItem)) {
                throw new Error(`The transaction doesn't correspond to given coin: ${ethTxItem.txid} ${coin.ticker}`);
            }

            return Erc20transactionUtils.etherTransactionsHistoryItemToErc20TransactionsHistoryItem(coin, ethTxItem);
        } catch (e) {
            improveAndRethrow(e, "getErc20TransactionDetails");
        }
    }

    /**
     * Checks whether given txId is of transaction belonging to given ERC20 token
     *
     * @param coin {Coin} erc20 token to check belonging for
     * @param txId {string} id of transaction (hash) to be checked
     * @return {Promise<boolean>} true if the given tx belongs to the given ERC20 token
     */
    static async doesTxBelongToErc20Token(coin, txId) {
        try {
            const ethereumHistoryItem = await EthTransactionDetailsService.getEthTransactionDetails(txId);
            return Erc20transactionUtils.isEthereumTransactionErc20TokenTransfer(coin, ethereumHistoryItem);
        } catch (e) {
            logError(
                e,
                "doesTxBelongToErc20Token",
                "We treat this error as that the checking tx is not belonging to " + coin.ticker
            );
            return false;
        }
    }
}
