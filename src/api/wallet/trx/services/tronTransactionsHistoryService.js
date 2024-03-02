import { improveAndRethrow } from "@rabbitio/ui-kit";

import { TronTransactionsProvider } from "../external-apis/tronTransactionsProvider.js";
import { TrxAddressesService } from "./trxAddressesService.js";

export class TronTransactionsHistoryService {
    static async getTrxTransactionsHistory() {
        try {
            const address = TrxAddressesService.getCurrentTrxAddress();
            return await TronTransactionsProvider.getTronTransactions(address);
        } catch (e) {
            improveAndRethrow(e, "getTrxTransactionsHistory");
        }
    }
}
