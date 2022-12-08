import { ethers } from "ethers";
import { getCurrentNetwork } from "../../../common/services/internal/storage";
import { Coins } from "../../coins";
import { ETH_PR_K_ETHSCAN } from "../../../../properties";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { EthersJsAdapter } from "../adapters/ethersJsAdapter";
import { EthTransactionsUtils } from "../lib/ethTransactionsUtils";

// TODO: [tests, moderate] implement units/integration tests
export class EthTransactionsProvider {
    static _provider = new ethers.providers.EtherscanProvider(getCurrentNetwork(Coins.COINS.ETH).key, ETH_PR_K_ETHSCAN);

    /**
     * Retrieves ethereum transactions sending ether for given address
     *
     * @param address {string} ethereum address to gt transactions for
     * @returns {Promise<TransactionsHistoryItem[]>} history items
     */
    static async getEthTransactionsByAddress(address) {
        try {
            // TODO: [feature, critical] check for pagination
            const txs = await this._provider.getHistory(address);

            /**
             * We so not use block retrieval as EtherScan provider gives us the timestamp in TransactionResponse.
             * Also, we pass null fee as fee is not mandatory for history item. Fee calculation for ether
             * is not trivial and requires 1 additional request per transaction as we need to ask for the tx receipt.
             */
            const historyItems = txs
                .map(tx => {
                    const firstItem = EthersJsAdapter.transactionToEthHistoryItem(tx, null, address, null);
                    if (firstItem.isSendingAndReceiving) {
                        const secondItem = EthersJsAdapter.transactionToEthHistoryItem(tx, null, address, null);
                        secondItem.type = firstItem.type === "in" ? "out" : "in";
                        return [firstItem, secondItem];
                    }

                    return firstItem;
                })
                .flat();

            return historyItems.filter(tx => EthTransactionsUtils.isEthereumTransactionAEtherTransfer(tx));
        } catch (e) {
            improveAndRethrow(e, "getEthTransactionsByAddress");
        }
    }
}
