import { improveAndRethrow, logError } from "../../../common/utils/errorUtils";
import { EthTransactionsProvider } from "../external-apis/ethTransactionsProvider";
import { EthAddressesService } from "./ethAddressesService";
import { EthereumBlockchainTransactionsProvider } from "../external-apis/ethereumBlockchainTransactionsProvider";
import { Coins } from "../../coins";
import { Coin } from "../../common/models/coin";
import { Erc20TransactionsProvider } from "../../erc20token/external-apis/erc20TransactionsProvider";

export class EthereumTransactionsHistoryService {
    /**
     * Get the history of transactions for current wallet.
     * Considers that the wallet has single address.
     *
     * Tries first eth-only provider as we use free one under the hood. If it fails tries whole blockchain txs retrieval
     * (under the hood is provider with only few free requests).
     * We use this provider-dependent logic because it allows us to priority use free data providers.
     *
     * @param coin {Coin} coin to get transactions for
     * @returns {Promise<TransactionsHistoryItem[]>} list of history items
     */
    static async getEthereumTransactionsHistory(coin) {
        try {
            const address = EthAddressesService.getCurrentEthAddress();
            try {
                if (coin === Coins.COINS.ETH) {
                    return await EthTransactionsProvider.getEthTransactionsByAddress(address);
                }
                const erc20List = await Erc20TransactionsProvider.getErc20TransactionsByAddress(address);
                return erc20List.filter(tx => tx.ticker === coin.ticker);
            } catch (e) {
                const ethereumBlockchainTransactions = await EthereumBlockchainTransactionsProvider.getEthereumBlockchainTransactions(
                    address
                );
                try {
                    const onlyEth = ethereumBlockchainTransactions.filter(tx => tx.ticker === Coins.COINS.ETH.ticker);
                    EthTransactionsProvider.actualizeCacheWithTransactionsReturnedByAnotherProvider(address, onlyEth);
                    const onlyErc20 = ethereumBlockchainTransactions.filter(t => t.protocol === Coin.PROTOCOLS.ERC20);
                    Erc20TransactionsProvider.actualizeCacheWithTransactionsReturnedByAnotherProvider(
                        address,
                        onlyErc20
                    );
                } catch (e) {
                    logError(e, "getEthTransactionsHistory", "Failed to actualize caches for eth and erc20 txs");
                }
                return ethereumBlockchainTransactions.filter(tx => tx.ticker === coin.ticker);
            }
        } catch (e) {
            improveAndRethrow(e, "getEthereumTransactionsHistory");
        }
    }
}
