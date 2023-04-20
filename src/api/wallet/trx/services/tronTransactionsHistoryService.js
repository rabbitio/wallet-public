import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { TronTransactionsProvider } from "../external-apis/tronTransactionsProvider";
import { TrxAddressesService } from "./trxAddressesService";

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
