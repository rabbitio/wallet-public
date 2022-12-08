import { improveAndRethrow } from "../../../common/utils/errorUtils";
import AddressesServiceInternal from "./internal/addressesServiceInternal";
import { transactionsDataProvider } from "./internal/transactionsDataProvider";
import { composeTransactionsHistoryItems } from "../lib/transactions/transactions-history";

export class BtcTransactionsHistoryService {
    /**
     * Retrieves BTC transactions history
     *
     * @return {Promise<TransactionsHistoryItem[]>} list of history items
     */
    static async getBtcTransactionsHistory() {
        try {
            const allAddresses = await AddressesServiceInternal.getAllUsedAddresses();
            const allAddressesSingleArray = allAddresses.internal.concat(allAddresses.external);
            const allTransactions = await transactionsDataProvider.getTransactionsByAddresses(allAddressesSingleArray);

            return composeTransactionsHistoryItems(allAddresses, allTransactions);
        } catch (e) {
            improveAndRethrow(e, "getBtcTransactionsHistory");
        }
    }
}
