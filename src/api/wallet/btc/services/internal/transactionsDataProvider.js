import { improveAndRethrow, Logger, CacheAndConcurrentRequestsResolver, CancelProcessing } from "@rabbitio/ui-kit";

import { Storage } from "../../../../common/services/internal/storage.js";
import { BtcTransactionDetailsProvider } from "../../external-apis/transactionDataAPI.js";
import {
    EventBus,
    NEW_BLOCK_DEDUPLICATED_EVENT,
    NEW_NOT_LOCAL_TRANSACTIONS_EVENT,
} from "../../../../common/adapters/eventbus.js";
import { BitcoinAddresses } from "../../lib/addresses.js";
import { TransactionsDataRetrieverService } from "./transactionsDataRetrieverService.js";
import { currentBlockService } from "./currentBlockService.js";
import {
    filterTransactionsSpendingTheSameUtxosAsGivenTransaction,
    removeDeclinedDoubleSpendingTransactionsFromList,
    setDoubleSpendFlag,
    setSpendTxId,
} from "../../lib/transactions/txs-list-calculations.js";
import AddressesServiceInternal from "./addressesServiceInternal.js";
import { BtcTransactionsHistory, getExtendedTransactionDetails } from "../../lib/transactions/transactions-history.js";
import AddressesService from "../addressesService.js";
import { Transaction } from "../../models/transaction/transaction.js";
import { STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS } from "../../../../common/utils/ttlConstants.js";
import { cache } from "../../../../common/utils/cache.js";

/**
 * Manages BTC transactions cache and its actualization.
 *
 * TODO: [tests, moderate] write unit tests
 * TODO: [refactoring, low] reorder methods
 */
class TransactionsDataProvider {
    constructor() {
        this._interval = null;
        this._eventListener = null;
        this._shouldDataRetrievalBeScheduled = true;
        this._cancelProcessingHolder = null;
        this._lastActualizedBlock = 0;

        this._cacheAndRequestsResolver = new CacheAndConcurrentRequestsResolver(
            "btcTransactionsDataResolver",
            cache,
            STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS,
            false
        );
        this._cacheKey = "6f22584a-f979-4a07-b565-6d6d903cb832";
    }

    /**
     * Useful re-setter for tests as we use single instance of this provider for the whole app.
     */
    resetState() {
        clearInterval(this._interval);
        EventBus.removeEventListener(NEW_BLOCK_DEDUPLICATED_EVENT, this._eventListener);
        this._cancelProcessingHolder && this._cancelProcessingHolder.cancel();
        this._cancelProcessingHolder = null;
        this._cacheAndRequestsResolver.invalidate(this._cacheKey);
    }

    async _doFullScanning(notifyAboutNewTxs = true) {
        try {
            if (this._cancelProcessingHolder) {
                this._cancelProcessingHolder.cancel();
                this._cancelProcessingHolder = null;
            }
        } catch (e) {
            Logger.logError(e, "_doFullScanning", "Failed to cancel previous full scanning");
        }

        let lockAcquisitionResult;
        try {
            this._cancelProcessingHolder = CancelProcessing.instance();
            lockAcquisitionResult = await this._cacheAndRequestsResolver.acquireLock(this._cacheKey);
            if (!lockAcquisitionResult?.result) {
                return this._cacheAndRequestsResolver.getCached(this._cacheKey) ?? [];
            }
            let addresses = await AddressesServiceInternal.getAllUsedAddresses();
            addresses = [...addresses.internal, ...addresses.external];
            const finalTxsList = await this._requestTransactionsDataAndMergeWithCached(
                addresses,
                this._cancelProcessingHolder,
                notifyAboutNewTxs
            );
            this._cacheAndRequestsResolver.saveCachedData(
                this._cacheKey,
                lockAcquisitionResult?.lockId,
                finalTxsList,
                true,
                true
            );
            return finalTxsList;
        } catch (e) {
            Logger.logError(e, "_doFullScanning");
        } finally {
            this._cacheAndRequestsResolver.releaseLock(this._cacheKey, lockAcquisitionResult?.lockId);
            this._cancelProcessingHolder = null;
        }
    }

    async _actualizeUnconfirmedTransactions() {
        try {
            const transactionsData = this._cacheAndRequestsResolver.getCached(this._cacheKey) ?? [];
            const unconfirmedTransactions = transactionsData.filter(tx => tx.confirmations === 0);
            const promises = unconfirmedTransactions.map(tx =>
                BtcTransactionDetailsProvider.retrieveTransactionData(tx.txid, Storage.getCurrentNetwork())
            );
            const unconfirmedTxsData = ((await Promise.all(promises)) ?? []).filter(tx => tx instanceof Transaction);
            const transactionIdsToBeRemovedFromCache = [];
            const notEmptyData = unconfirmedTxsData.reduce((prev, current, index) => {
                if (!current) {
                    const idOfCheckingTransaction = unconfirmedTransactions[index].txid;
                    const isThereUnconfirmedDoubleSpendingTxsForCurrentOne =
                        !!filterTransactionsSpendingTheSameUtxosAsGivenTransaction(current, unconfirmedTxsData);
                    if (!isThereUnconfirmedDoubleSpendingTxsForCurrentOne) {
                        /**
                         * Here we are processing case when we have some unconfirmed tx in cache but its data was not
                         * retrieved from the blockchain above. Normally we need to remove such transaction from the
                         * list, but we need to take into account RBF case.
                         *
                         * When RBF is in progress we have two transactions in cache - old one and new one replacing
                         * the old tx. Usually the replaced transaction is being removed from the mempool right
                         * after accepting the new replacing one. But from the beginning we decided to show
                         * both old and new transactions until the new one is confirmed. So we check here whether we
                         * have the not confirmed transaction sending the same UTXO(s) related to this 'detached'
                         * transaction. And if so we don't remove this 'detached' one from the cache as it will be removed
                         * later in 'removeDeclinedDoubleSpendingTransactionsFromList' method.
                         * TODO: [feature, moderate] This approach maybe should be reassessed, task_id=4694ca08f41644169b58cd7dad624040
                         */
                        transactionIdsToBeRemovedFromCache.push(idOfCheckingTransaction);
                        return [...prev];
                    }
                }

                return [...prev, current];
            }, []);

            await this.updateTransactionsCache(notEmptyData, transactionIdsToBeRemovedFromCache);
        } catch (e) {
            improveAndRethrow(e, "_actualizeUnconfirmedTransactions");
        }
    }

    _setupRareFullScanInterval() {
        this._interval = setInterval(() => this._doFullScanning(), 7 * 60000);
    }

    /**
     * This method should be called before accessing other methods in this class.
     * Here we schedule rare scanning for all addresses and setup event listener for new blocks.
     * Also, we call txs loading here for all addresses to fill the cache when starting the app.
     */
    async initialize() {
        const loggerSource = "initialize";
        Logger.log("Start initializing transactions provider", loggerSource);

        const currentTxsCache = this._cacheAndRequestsResolver.getCached(this._cacheKey);
        if (currentTxsCache != null) {
            Logger.log("Transactions provider already initialized", loggerSource);
            return;
        }

        try {
            if (this._shouldDataRetrievalBeScheduled) {
                this._eventListener = () => {
                    this._actualizeConfirmationsNumber();
                    this.markDataAsExpired();
                    this._actualizeUnconfirmedTransactions();
                };
                EventBus.addEventListener(NEW_BLOCK_DEDUPLICATED_EVENT, this._eventListener);

                /* We set an interval for the rare full scanning to cover cases when there are many addresses
                 * used in a wallet.
                 * Also here we perform the full scanning ones when initializing the app. After the initialization
                 * we will perform scanning rarely using the interval that we set here. Such a rare scanning is affordable
                 * as the full scanning tries to find the new transactions at the old bitcoin addresses.
                 * But this is just a compatibility feature to support users that have old wallets with lots
                 * of transactions sent to/from the different addresses belonging to the same wallet (this approach
                 * was popular at first Bitcoin wallets for 'anonymity' but makes almost no effect on anonymity now).
                 */
                this._setupRareFullScanInterval();
                await this._doFullScanning(false);

                Logger.log(
                    `Full scanning was performed at the initialization, txs count: ${
                        this._cacheAndRequestsResolver.getCached(this._cacheKey)?.length
                    }`,
                    loggerSource
                );
            }
            Logger.log("Successfully initialized bitcoin transactions provider", loggerSource);
        } catch (e) {
            improveAndRethrow(e, loggerSource, "Failed to initialize the bitcoin transactions provider");
        }
    }

    /**
     * Marks the cached data as expired so when the next data retrieval is requested
     * it will be done by actually calling the data providers.
     */
    markDataAsExpired() {
        try {
            if (this._cancelProcessingHolder) this._cancelProcessingHolder.cancel();
            if (this._interval) clearInterval(this._interval);
            this._setupRareFullScanInterval();
            this._cacheAndRequestsResolver.markAsExpiredButDontRemove(this._cacheKey);
        } catch (e) {
            improveAndRethrow(e, "markDataAsExpired");
        }
    }

    /**
     * Use this flag to enable/disable data retrieval.
     * Useful for testing.
     *
     * @param value {boolean}
     */
    setShouldDataRetrievalBeScheduled(value) {
        this._shouldDataRetrievalBeScheduled = !!value;
        !value && clearInterval(this._interval);
    }

    /**
     * Adds given transactions to the internal cache.
     *
     * This can be useful as this provider is used as the only point of the bitcoin
     * transactions data storing. But at least for checking addresses usage we utilize dedicated service,
     * and we retrieve some transactions there so this method allows to store these transactions inside
     * the cache to become available for the whole app.
     *
     * @param transactionsData {Transaction[]} the transactions that should be added to the cache
     * @param [excludeIds=[]] {string[]} pass transaction ids if you need to exclude them from the cached list
     */
    updateTransactionsCache(transactionsData, excludeIds = []) {
        try {
            this._cacheAndRequestsResolver.actualizeCachedData(
                this._cacheKey,
                cached => ({
                    isModified: true,
                    data: this._improveRetrievedRawTransactionsData(transactionsData, cached).filter(
                        tx => !excludeIds.find(id => id === tx.txid)
                    ),
                }),
                true
            );
        } catch (e) {
            improveAndRethrow(e, "updateTransactionsCache");
        }
    }

    _actualizeConfirmationsNumber() {
        try {
            const currentBlock = currentBlockService.getCurrentBlockHeight();
            if (this._lastActualizedBlock !== currentBlock) {
                this._cacheAndRequestsResolver.actualizeCachedData(
                    this._cacheKey,
                    cached => ({
                        isModified: true,
                        data: (cached ?? []).map(tx => {
                            tx.confirmations > 0 && (tx.confirmations = currentBlock - tx.block_height + 1);
                            return tx;
                        }),
                    }),
                    true
                );
                this._lastActualizedBlock = currentBlock;
            }
        } catch (e) {
            improveAndRethrow(e, "_actualizeConfirmationsNumber");
        }
    }

    /**
     * Retrieves a list of Transaction objects for given addresses.
     *
     * @param addresses {string[]} addresses to get transactions for
     * @param [allowDoubleSpend=true] {boolean} whether to include double-spending transactions in the returning set,
     *        true by default
     * @return {Promise<Transaction[]>} array of transaction data objects
     */
    async getTransactionsByAddresses(addresses, allowDoubleSpend = true) {
        let result;
        try {
            result = await this._cacheAndRequestsResolver.getCachedOrWaitForCachedOrAcquireLock(this._cacheKey);
            let transactionsForAllAddresses;
            if (result?.canStartDataRetrieval) {
                /* Here we request transactions ONLY for current external addresses (segwit and legacy) and current change address.
                 * This is needed to avoid abusing the underlying data providers APIs. We return the cached
                 * transactions for all other requested addresses under the hood.
                 * NOTE: the data retrieval for ALL addresses is being performed by schedule in the background but rarely.
                 */
                const currentAddresses = await Promise.all([
                    AddressesService.getCurrentExternalAddress(AddressesService.ADDRESSES_TYPES.LEGACY),
                    AddressesService.getCurrentExternalAddress(AddressesService.ADDRESSES_TYPES.SEGWIT),
                    AddressesService.getCurrentChangeAddress(),
                ]);
                transactionsForAllAddresses = await this._requestTransactionsDataAndMergeWithCached(currentAddresses);
                this._cacheAndRequestsResolver.saveCachedData(
                    this._cacheKey,
                    result?.lockId,
                    transactionsForAllAddresses,
                    true,
                    true
                );
            } else {
                transactionsForAllAddresses = result?.cachedData ?? [];
            }
            const relatedToAddresses = transactionsForAllAddresses.filter(
                tx =>
                    (allowDoubleSpend || !tx.double_spend) &&
                    (tx.inputs.find(input => addresses.includes(input.address)) ||
                        tx.outputs.find(output => output.addresses.find(address => addresses.includes(address))))
            );
            return relatedToAddresses.map(tx => tx.clone()); // We clone for safety to ensure the original cache isn't touched
        } catch (e) {
            improveAndRethrow(e, "getTransactionsByAddresses");
        } finally {
            this._cacheAndRequestsResolver.releaseLock(this._cacheKey, result?.lockId);
        }
    }

    async _requestTransactionsDataAndMergeWithCached(
        addresses,
        cancelProcessingHolder = null,
        notifyAboutNewTxs = true
    ) {
        const addressesUpdateTimestamps = [];
        const loggerSource = "_requestTransactionsDataAndMergeWithCached";
        try {
            const network = Storage.getCurrentNetwork();
            const addressesOfNetwork = addresses.filter(
                address => BitcoinAddresses.getNetworkByAddress(address).key === network.key
            );
            // TODO: [refactoring, moderate] We have a duplicated cache expiration logic inside the TransactionsDataRetrieverService
            let newData = await TransactionsDataRetrieverService.performTransactionsRetrieval(
                addressesOfNetwork,
                network,
                cancelProcessingHolder,
                addressesUpdateTimestamps
            );

            newData = newData.filter(dataItem => dataItem?.txid != null);
            if (notifyAboutNewTxs) {
                await this._notifyAboutDiscoveredTransactions(newData);
            }
            const cachedTransactions = this._cacheAndRequestsResolver.getCached(this._cacheKey) ?? [];
            const finalTxsList = this._improveRetrievedRawTransactionsData(newData, cachedTransactions);
            Logger.log(`Retrieved ${finalTxsList.length} BTC transactions`, loggerSource);
            return finalTxsList;
        } catch (e) {
            Logger.logError(e, loggerSource, "Transactions data retrieval failed");
            return [];
        }
    }

    /**
     * Retrieves the details for transaction by its id.
     * The transaction should be present inside the local cache.
     *
     * @param txId {string} id of tx to get data for
     * @return {Promise<TransactionsHistoryItem|null>} transaction object with details or null if it is not found.
     */
    async getTransactionData(txId) {
        try {
            const addresses = await AddressesServiceInternal.getAllUsedAddresses();
            const dataRes = await this._cacheAndRequestsResolver.getCachedOrWaitForCachedOrAcquireLock(this._cacheKey);
            if (dataRes?.canStartDataRetrieval) {
                /* We don't start the whole transactions data retrieval here.
                 * Because we will start the exact transaction details retrieval below instead.
                 */
                await this._cacheAndRequestsResolver.releaseLock(this._cacheKey, dataRes.lockId);
            }
            let data = dataRes?.cachedData ?? [];
            if (!data.find(tx => tx.txid === txId)) {
                const gotTx = await BtcTransactionDetailsProvider.retrieveTransactionData(
                    txId,
                    Storage.getCurrentNetwork()
                );
                if (gotTx && Array.isArray(addresses?.internal) && Array.isArray(addresses?.external)) {
                    const isTransactionRelatedToCurrentWallet = [
                        ...gotTx.inputs.map(input => input.address),
                        ...gotTx.outputs.map(output => output.addresses[0]),
                    ].find(a => addresses.internal.find(int => int === a) || addresses.external.find(ext => ext === a));
                    if (isTransactionRelatedToCurrentWallet) {
                        this.updateTransactionsCache([gotTx]);
                        await this._notifyAboutDiscoveredTransactions([gotTx], addresses);
                        // Retrieving the cache ones again as we added a new item to cache
                        data = this._cacheAndRequestsResolver.getCached(this._cacheKey) ?? [];
                    }
                }
            }
            let result = data.find(tx => tx.txid === txId);
            if (result) {
                result = getExtendedTransactionDetails(result, addresses);
            }
            return result ?? null;
        } catch (e) {
            improveAndRethrow(e, "getTransactionData");
        }
    }

    /**
     * Notifies about new transactions created not locally. The transaction can be either incoming or
     * externally created outgoing transaction.
     *
     * @param newData {Transaction[]} new retrieved transactions list
     * @param allAddresses {{internal: string[], external: string[]}|null}
     * @private
     */
    async _notifyAboutDiscoveredTransactions(newData, allAddresses = null) {
        try {
            const transactionsData = this._cacheAndRequestsResolver.getCached(this._cacheKey) ?? [];
            const newTxs = newData.filter(newTx => !transactionsData.find(tx => tx.txid === newTx.txid));
            const addresses = allAddresses ?? (await AddressesServiceInternal.getAllUsedAddresses());
            const txHistoryItems = BtcTransactionsHistory.composeTransactionsHistoryItems(addresses, newTxs);
            newTxs.length && EventBus.dispatch(NEW_NOT_LOCAL_TRANSACTIONS_EVENT, null, txHistoryItems);
        } catch (e) {
            improveAndRethrow(e, "_notifyAboutDiscoveredTransactions");
        }
    }

    _improveRetrievedRawTransactionsData(newData, oldData) {
        try {
            newData = newData ?? [];
            oldData = oldData ?? [];
            oldData.forEach(tx => {
                if (!newData.find(newTx => tx.txid === newTx.txid)) {
                    // Note that declined transactions can be persisted here (like ones replaced by fee, use .double_spend to check)
                    newData.push(tx);
                }
            });

            setDoubleSpendFlag(newData);
            setSpendTxId(newData);
            return removeDeclinedDoubleSpendingTransactionsFromList(newData);
        } catch (e) {
            improveAndRethrow(e, "_improveRetrievedRawTransactionsData");
        }
    }
}

export const transactionsDataProvider = new TransactionsDataProvider();
