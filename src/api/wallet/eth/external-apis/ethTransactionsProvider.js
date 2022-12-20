import { ethers } from "ethers";
import { getCurrentNetwork } from "../../../common/services/internal/storage";
import { Coins } from "../../coins";
import { ETH_PR_K_ETHSCAN } from "../../../../properties";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { EthersJsAdapter } from "../adapters/ethersJsAdapter";
import { EthTransactionsUtils } from "../lib/ethTransactionsUtils";
import { CacheAndConcurrentRequestsResolver } from "../../../common/services/utils/robustExteranlApiCallerService/cacheAndConcurrentRequestsResolver";

// TODO: [tests, moderate] implement units/integration tests
export class EthTransactionsProvider {
    static _provider = new ethers.providers.EtherscanProvider(getCurrentNetwork(Coins.COINS.ETH).key, ETH_PR_K_ETHSCAN);
    static _cacheAndRequestsResolver = new CacheAndConcurrentRequestsResolver("ethTransactionsProvider", 0, 20, 1000);
    static _cacheTtlMs = 30000;
    static _cacheId = address => `${address}_b94059fd-2170-46f1-8917-b9611c22ef11`;
    static _lastUpdateTimestampByAddress = new Map();

    /**
     * Retrieves ethereum transactions sending ether for given address
     *
     * @param address {string} ethereum address to gt transactions for
     * @returns {Promise<TransactionsHistoryItem[]>} history items
     */
    static async getEthTransactionsByAddress(address) {
        try {
            const cached = await this._cacheAndRequestsResolver.getCachedResultOrWaitForItIfThereIsActiveCalculation(
                this._cacheId(address)
            );
            const expirationTimestamp = (this._lastUpdateTimestampByAddress.get(address) ?? 0) + this._cacheTtlMs;
            let transactions;
            if (cached && Date.now() < expirationTimestamp) {
                transactions = cached;
            } else {
                // TODO: [feature, critical] check for pagination. task_id=b10ff856bea04ebca54a1d284d24196d
                const actualizedTxs = await this._provider.getHistory(address);
                this._lastUpdateTimestampByAddress.set(address, Date.now());
                if (cached?.length && actualizedTxs?.length) {
                    // Add cached transactions missing in the returned transactions list. This is useful when we push just sent transaction to cache
                    cached.forEach(cachedTx => {
                        if (!actualizedTxs.find(newTx => newTx.hash === cachedTx.hash)) {
                            actualizedTxs.push(cachedTx);
                        }
                    });
                }
                this._cacheAndRequestsResolver.saveCachedData(this._cacheId(address), actualizedTxs);
                transactions = actualizedTxs;
            }

            /**
             * We so not use block retrieval as EtherScan provider gives us the timestamp in TransactionResponse.
             * Also, we pass null fee as fee is not mandatory for history item. Fee calculation for ether
             * is not trivial and requires 1 additional request per transaction as we need to ask for the tx receipt.
             */
            const historyItems = transactions
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
        } finally {
            this._cacheAndRequestsResolver.markActiveCalculationAsFinished(this._cacheId(address));
        }
    }

    /**
     * Puts the just sent transaction by given data to cache to force it to appear in the app as fast as possible.
     *
     * @param address {string} the sending address
     * @param txData {TxData} the TxData object used to send a transaction
     * @param txId {string} the id of transaction
     */
    static actualizeCacheWithNewTransactionSentFromAddress(address, txData, txId) {
        try {
            const txForCache = {
                hash: txId,
                to: txData.address,
                value: txData.amount,
                from: address,
                confirmations: 0,
                timestamp: Date.now(),
            };
            this._cacheAndRequestsResolver.actualizeCachedData(this._cacheId(address), currentCache => {
                try {
                    currentCache.push(txForCache);
                    return {
                        data: currentCache,
                        isModified: true,
                    };
                } catch (e) {
                    improveAndRethrow(e, "cacheActualizationHandler for ethTransactionsProvider");
                }
            });
        } catch (e) {
            improveAndRethrow(e, "actualizeCacheWithNewTransactionSentFromAddress");
        }
    }
}
