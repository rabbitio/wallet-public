import { improveAndRethrow } from "@rabbitio/ui-kit";

import { TrxAddressesService } from "../../trx/services/trxAddressesService.js";
import { Trc20TransactionsProvider } from "../external-apis/trc20TransactionsProvider.js";

export class Trc20TransactionsHistoryService {
    static async getTrc20TokenTransactionsHistory(coin) {
        try {
            const address = TrxAddressesService.getCurrentTrxAddress();
            const allTronBlockchainTransactions = await Trc20TransactionsProvider.getTrc20Transactions(address);
            return allTronBlockchainTransactions.filter(tx => tx.ticker === coin.ticker);
        } catch (e) {
            improveAndRethrow(e, "getTrc20TokenTransactionsHistory");
        }
    }
}
