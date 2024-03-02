import { improveAndRethrow } from "@rabbitio/ui-kit";

import AddressesServiceInternal from "./internal/addressesServiceInternal.js";
import { transactionsDataProvider } from "./internal/transactionsDataProvider.js";
import { BtcTransactionsHistory } from "../lib/transactions/transactions-history.js";

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

            return BtcTransactionsHistory.composeTransactionsHistoryItems(allAddresses, allTransactions);
        } catch (e) {
            improveAndRethrow(e, "getBtcTransactionsHistory");
        }
    }
}
