import { ethers } from "ethers";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { ETH_PR_K } from "../../../../properties";
import { Coins } from "../../coins";
import { getCurrentNetwork } from "../../../common/services/internal/storage";
import { EthersJsAdapter } from "../adapters/ethersJsAdapter";

export class EthTransactionDetailsProvider {
    static _provider = new ethers.providers.AlchemyProvider(getCurrentNetwork(Coins.COINS.ETH).key, ETH_PR_K);

    /**
     * Retrieves details for ethereum transaction.
     * If transaction is not confirmed returns the gas limit fee. If the transaction is confirmed returns the actually
     * spent fee.
     *
     * @param txId {string} ethereum transaction hash
     * @param [currentWalletAddress] {string} ethereum address to check the transaction type (incoming or outgoing).
     *        Type is "out" if the address is not specified
     * @return {Promise<TransactionsHistoryItem>|null} resolves to transaction or null if no such tx in the ethereum blockchain
     */
    // TODO: [feature, moderate, ether] add cache for transactions history and take a look at it first for confirmed transactions
    // TODO: [tests, critical, ether] implement unit and integration tests
    static async getEthTransactionDetails(txId, currentWalletAddress = null) {
        try {
            const tx = await this._provider.getTransaction(txId);
            if (!tx) {
                return null;
            }

            let fee = tx.gasLimit.mul(tx.gasPrice);
            if (tx.confirmations > 0) {
                const txReceipt = await this._provider.getTransactionReceipt(txId);
                fee = txReceipt.effectiveGasPrice.mul(txReceipt.gasUsed);
            }

            // TODO: [refactoring, blocker] Create dedicated service with blocks cache in RAM to avoid a lot of redundant calls to provider
            const block = await this._provider.getBlock(tx.blockNumber);

            return EthersJsAdapter.transactionToEthHistoryItem(tx, block, currentWalletAddress, fee.toString());
        } catch (e) {
            improveAndRethrow(e, "getEthTransactionDetails");
        }
    }
}
