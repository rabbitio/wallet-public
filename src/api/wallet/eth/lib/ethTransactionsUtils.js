import { improveAndRethrow } from "@rabbitio/ui-kit";

export class EthTransactionsUtils {
    /**
     * Checks whether given ethereum network transaction is exactly transfers ether.
     * We consider the tx is not ether transfer if the amount is zero or null/undefined.
     *
     * @param tx {TransactionsHistoryItem}
     * @returns {boolean} true if the transaction is ether coin transfer and false otherwise
     */
    static isEthereumTransactionAEtherTransfer(tx) {
        try {
            return !(tx?.amount == null || tx.amount === 0 || /^0+\.?0*$/.test(tx.amount));
        } catch (e) {
            improveAndRethrow(e, "isEthereumTransactionAEtherTransfer");
        }
    }

    static estimateEthereumConfirmationsByTimestamp(timestamp) {
        const averageBlockTimeMs = 13000;
        return Math.ceil((Date.now() - timestamp) / averageBlockTimeMs);
    }
}
