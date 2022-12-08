import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { EthAddressesService } from "../../eth/services/ethAddressesService";
import { Logger } from "../../../support/services/internal/logs/logger";
import { Erc20TransactionsProvider } from "../external-apis/erc20TransactionsProvider";

export class Erc20TokenTransactionsHistoryService {
    /**
     * Retrieves token's transactions history for current wallet
     *
     * @param coin {Coin} token to get balance for
     * @returns {Promise<TransactionsHistoryItem[]>} list of history items
     */
    static async getTransactionsList(coin) {
        try {
            const address = EthAddressesService.getCurrentEthAddress();
            const history = await Erc20TransactionsProvider.getErc20TransactionsByAddress(coin, address);
            Logger.log(`Retrieved ${history.length} txs`);

            return history;
        } catch (e) {
            improveAndRethrow(e, "getTransactionsList");
        }
    }
}
