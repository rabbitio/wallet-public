import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { EthTransactionsProvider } from "../external-apis/ethTransactionsProvider";
import { EthAddressesService } from "./ethAddressesService";

export class EthTransactionsHistoryService {
    /**
     * Get the history of transactions for current wallet.
     * Considers that the wallet has single address.
     *
     * @returns {Promise<TransactionsHistoryItem[]>} list of history items
     */
    static async getEthTransactionsHistory() {
        try {
            const address = EthAddressesService.getCurrentEthAddress();
            return await EthTransactionsProvider.getEthTransactionsByAddress(address);
        } catch (e) {
            improveAndRethrow(e, "getEthTransactionsHistory");
        }
    }
}
