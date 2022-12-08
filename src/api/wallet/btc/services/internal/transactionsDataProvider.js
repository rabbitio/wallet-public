import { getTXIDSendingGivenOutput } from "../../lib/utxos";
import { getCurrentNetwork } from "../../../../common/services/internal/storage";
import { improveAndRethrow, logError } from "../../../../common/utils/errorUtils";
import { Utxo } from "../../models/transaction/utxo";
import { retrieveTransactionData } from "../../external-apis/transactionDataAPI";
import {
    EventBus,
    NEW_BLOCK_DEDUPLICATED_EVENT,
    NEW_NOT_LOCAL_TRANSACTIONS_EVENT,
    TX_DATA_RETRIEVED_EVENT,
} from "../../../../common/adapters/eventbus";
import TransactionsApi from "../../../common/backend-api/transactionsApi";
import { getNetworkByAddress } from "../../lib/addresses";
import { addressesMetadataService } from "./addressesMetadataService";
import { TransactionsDataRetrieverService } from "./transactionsDataRetrieverService";
import { CancelProcessing } from "../../../../common/services/utils/robustExteranlApiCallerService/cancelProcessing";
import { ExternalBlocksApiCaller } from "../../external-apis/blocksAPI";
import { currentBlockService } from "./currentBlockService";
import { postponeExecution } from "../../../../common/utils/browserUtils";
import { MAX_ATTEMPTS_TO_RETRIEVE_TRANSACTIONS_DATA } from "../../../../../properties";
import {
    removeDeclinedDoubleSpendingTransactionsFromList,
    setDoubleSpendFlag,
    setSpendTxId,
} from "../../lib/transactions/txs-list-calculations";
import { Logger } from "../../../../support/services/internal/logs/logger";

/**
 * Manages frequent and full scanning for transactions by addresses. Manages transactions data cache filling from
 * backend data.
 */
class TransactionsDataProvider {
    constructor() {
        this._isInitialized = false;
        this._transactionsData = [];

        /**
         * Interval of frequent transactions data retrieval
         */
        this.pollingIntervalMS = 1000;

        /**
         * Period of background data reloading. This interval affects all requests for data as we always return cached data.
         * Depending on using the batch mode for BTC transaction we use different interval timeouts. Internally we do
         * scanning only for frequently used addresses if the batch mode is disabled.
         */
        this.dataUpdateTimeoutMS = TransactionsDataRetrieverService.isBatchRetrievalModeWorkingRightNow()
            ? 20000
            : 15000;

        /**
         * Max number of polls parameter affect time to fail for long performing requests and also covers max time
         * for several APIs calling in case of errors with one of external APIs. Some APIs of this provider allows to pass
         * custom count of polls
         */
        this.maxPollsCount = MAX_ATTEMPTS_TO_RETRIEVE_TRANSACTIONS_DATA;
        this._interval = null;
        this._eventListener = null;
        this._shouldDataRetrievalBeScheduled = true;
        this._cancelProcessingHolder = null;
        this._lastActualizedBlock = 0;
    }

    /**
     * Useful re-setter for tests as we use single instance for the whole app
     */
    resetState() {
        this._isInitialized = false;
        this._transactionsData = [];
        clearInterval(this._interval);
        EventBus.removeEventListener(NEW_BLOCK_DEDUPLICATED_EVENT, this._eventListener);
        this._cancelProcessingHolder && this._cancelProcessingHolder.cancel();
        this._cancelProcessingHolder = null;
    }

    async _doFrequentScanning() {
        try {
            const frequentAddresses = await addressesMetadataService.getAddressesForFrequentScanning();
            await this._retrieveData(frequentAddresses);
        } catch (e) {
            logError(e, "_doFrequentScanning");
        }
    }

    async _doFullScanning() {
        try {
            if (this._cancelProcessingHolder) {
                this._cancelProcessingHolder.cancel();
                this._cancelProcessingHolder = null;
            }
        } catch (e) {
            logError(e, "_doFullScanning", "Failed to cancel previous full scanning");
        }

        try {
            const addresses = addressesMetadataService.getAddressesSortedByLastUpdateDate();
            this._cancelProcessingHolder = CancelProcessing.instance();
            await this._retrieveData(addresses, this._cancelProcessingHolder);
        } catch (e) {
            logError(e, "_doFullScanning");
        } finally {
            this._cancelProcessingHolder = null; // TODO: [bug, moderate] can this affect another call of this method?
        }
    }

    async _actualizeUnconfirmedTransactions() {
        try {
            const unconfirmedTransactions = this._transactionsData.filter(tx => tx.confirmations === 0);
            const promises = unconfirmedTransactions.map(tx => retrieveTransactionData(tx.txid, getCurrentNetwork()));
            const unconfirmedTxsData = await Promise.all(promises);
            const notEmptyData = unconfirmedTxsData.reduce((prev, current, index) => {
                if (!current) {
                    this._transactionsData = this._transactionsData.filter(
                        tx => tx.txid !== unconfirmedTransactions[index].txid
                    );
                    return [...prev];
                }

                return [...prev, current];
            }, []);

            await this.updateTransactionsCacheAndPushTxsToServer(notEmptyData);
        } catch (e) {
            improveAndRethrow(e, "_actualizeUnconfirmedTransactions");
        }
    }

    /**
     * Retrieves transactions stored on server. Also schedules frequent scanning and creates new blocks listener to
     * start full scanning.
     * This method should be called only ones when the app is loaded.
     *
     * (and there is wallet dats) or after successful login.
     *
     * @param addresses - list of addresses to get transactions from server for. Usually this list should contain all
     *                    addresses of the wallet
     *
     * @return {boolean} - whether the operation was successful
     */
    async initialize(addresses) {
        const loggerSource = "initialize";
        Logger.log("Start initializing transactions provider", loggerSource);
        if (this._isInitialized) {
            Logger.log("Transactions provider already initialized", loggerSource);
            return;
        }

        try {
            const currentBlockHeight = await ExternalBlocksApiCaller.retrieveCurrentBlockNumber(getCurrentNetwork());

            Logger.log(`Initializing for block height ${currentBlockHeight}`, loggerSource);

            const transactionsData = await TransactionsApi.getTransactionsByAddresses(addresses, currentBlockHeight);

            Logger.log(`Retrieved ${transactionsData.length} transactions`, loggerSource);

            this._transactionsData = improveRetrievedRawTransactionsData(
                transactionsData,
                this._transactionsData,
                true
            );

            // TODO: make below code independent of the above code that can fail and initialization will not be performed
            await addressesMetadataService.recalculateAddressesMetadataByTransactions(this._transactionsData);
            if (this._shouldDataRetrievalBeScheduled) {
                if (TransactionsDataRetrieverService.isBatchRetrievalModeWorkingRightNow()) {
                    this._interval = setInterval(() => this._doFullScanning(), this.dataUpdateTimeoutMS);
                } else {
                    this._interval = setInterval(() => this._doFrequentScanning(), this.dataUpdateTimeoutMS);
                }
                this._eventListener = () => {
                    this._doFullScanning();
                    this._actualizeUnconfirmedTransactions();
                };
                EventBus.addEventListener(NEW_BLOCK_DEDUPLICATED_EVENT, this._eventListener);

                await this._doFullScanning();
                Logger.log(`Full scanning performed, count: ${this._transactionsData.length}`, loggerSource);
            }

            Logger.log("Successfully initialized", loggerSource);
            this._isInitialized = true;
        } catch (e) {
            improveAndRethrow(e, loggerSource, "Failed to initialize the provider");
        }
    }

    /**
     * Use this flag to enable/disable data scheduling
     * @param value
     */
    setShouldDataRetrievalBeScheduled(value) {
        this._shouldDataRetrievalBeScheduled = !!value;
        !value && clearInterval(this._interval);
    }

    /**
     * Adds given transactions to the internal cache and saves confirmed ones not present on server to the server.
     *
     * This can be useful as this provider is used as the only point of
     * transactions data storing. But at least for checking addresses usage we utilize dedicated service and we retrieve
     * some transactions there - this method allows to store them inside this provider to become available for the
     * whole app.
     *
     * @param transactionsData {Array<Transaction>}
     */
    async updateTransactionsCacheAndPushTxsToServer(transactionsData) {
        try {
            this._transactionsData = improveRetrievedRawTransactionsData(
                transactionsData,
                this._transactionsData,
                false
            );
            await this._storeConfirmedTransactions();
        } catch (e) {
            improveAndRethrow(e, "updateTransactionsCacheAndPushTxsToServer");
        }
    }

    async _storeConfirmedTransactions() {
        const loggerSource = "_storeConfirmedTransactions";
        try {
            const notStoredTxs = this._transactionsData.filter(tx => !tx.isStoredOnServer && tx.confirmations > 0);

            if (notStoredTxs.length) {
                notStoredTxs.forEach(tx => (tx.isStoredOnServer = true)); // We set the flag first to avoid concurrent savings
                try {
                    await TransactionsApi.saveTransactions(notStoredTxs);
                    Logger.log(`Stored: ${notStoredTxs.map(tx => tx.txid.slice(0, 7)).join(",")}`, loggerSource);
                } catch (e) {
                    Logger.log(`Failed to store transactions data on server: ${e?.message}`, loggerSource);
                    // Rolling back flag in case of errors to save them later
                    notStoredTxs.forEach(tx => (tx.isStoredOnServer = false));
                }
            }
        } catch (e) {
            logError(e, loggerSource, "Failed to store transactions data on server.");
        }
    }

    async waitForTransactionsToBeStoredOnServer(waitPeriodMS = 30000) {
        try {
            let attemptsCount = Math.floor(waitPeriodMS / 1000);
            while (
                this._transactionsData.filter(tx => !tx.isStoredOnServer && tx.confirmations > 0).length > 0 &&
                attemptsCount
            ) {
                // eslint-disable-next-line no-loop-func
                await postponeExecution(() => --attemptsCount, 1000);
            }
        } catch (e) {
            logError(
                e,
                "waitForTransactionsToBeStoredOnServer",
                "Not all discovered transactions were stored on server for some reason. It is not critical but may cause eventual consistency for transactions history"
            );
        }
    }

    _actualizeConfirmationsNumber() {
        // TODO: [feature, low] maybe create an event listener to handle new blocks? otherwise we need to remember about this function to be called inside each data retrieval
        const currentBlock = currentBlockService.getCurrentBlockHeight();
        if (this._lastActualizedBlock !== currentBlock) {
            this._transactionsData.forEach(
                tx => tx.confirmations > 0 && (tx.confirmations = currentBlock - tx.block_height + 1)
            );
            this._lastActualizedBlock = currentBlock;
        }
    }

    /**
     * Retrieves a list of Transaction objects for given addresses.
     *
     * @param addresses - addresses to get transactions for
     * @param allowDoubleSpend - whether to include double-spending transactions in the returning set, true by default
     * @param maxPollsCount - max number of data retrieval checks
     * @return {Promise<Array<Transaction>>} - array of transaction data objects
     */
    async getTransactionsByAddresses(addresses, allowDoubleSpend = true, maxPollsCount = null) {
        try {
            this._actualizeConfirmationsNumber();
            const getData = provider => {
                const relatedToAddresses = provider._transactionsData.filter(
                    tx =>
                        (allowDoubleSpend || !tx.double_spend) &&
                        (tx.inputs.find(input => addresses.includes(input.address)) ||
                            tx.outputs.find(output => output.addresses.find(address => addresses.includes(address))))
                );

                return relatedToAddresses.map(tx => tx.clone());
            };

            return new Promise((resolve, reject) =>
                returnOrPostpone(this, getData, this.pollingIntervalMS, resolve, reject, 0, maxPollsCount)
            );
        } catch (e) {
            improveAndRethrow(e, "getTransactionsByAddresses");
        }
    }

    /**
     * Adds new transaction to cache. Useful to add new transaction to cache immediately without waiting for
     * retrieving it from blockchain explorers
     *
     * @param newTx - Transaction - new tx
     * @return Promise resolving to undefined
     */
    async pushNewTransactionToCache(newTx) {
        this._transactionsData = improveRetrievedRawTransactionsData([newTx], this._transactionsData);
        Logger.log(`New transaction pushed to cache: ${newTx.txid}`, "pushNewTransactionToCache");
    }

    // TODO: [tests, moderate] write units
    async _retrieveData(addresses, cancelProcessingHolder) {
        const addressesUpdateTimestamps = [];
        try {
            let fetchingErrors = [];

            try {
                const dataArrays = await Promise.all(
                    [getCurrentNetwork()].map(network => {
                        const addressesOfNetwork = addresses.filter(
                            address => getNetworkByAddress(address).key === network.key
                        );
                        return TransactionsDataRetrieverService.performTransactionsRetrieval(
                            addressesOfNetwork,
                            network,
                            cancelProcessingHolder,
                            addressesUpdateTimestamps
                        ).catch(e => fetchingErrors.push(e));
                    })
                );
                const newData = dataArrays.flat().filter(data => data.txid);
                this._notifyAboutNewIncomingTransactions(newData);
                this._transactionsData = improveRetrievedRawTransactionsData(newData, this._transactionsData);
                await this._storeConfirmedTransactions();
            } catch (e) {
                fetchingErrors.push(e);
            } finally {
                fetchingErrors.forEach(e => logError(e, "_retrieveData", "Transactions data retrieval failed"));

                try {
                    await addressesMetadataService.recalculateAddressesMetadataByTransactions(
                        this._transactionsData,
                        addressesUpdateTimestamps
                    );
                } catch (e) {
                    logError(e, "_retrieveData", "Failed to recalculate metadata for addresses");
                }
            }
        } catch (e) {
            improveAndRethrow(e, "_retrieveData");
        }
    }

    /**
     * Retrieves count of transactions for given address
     *
     * @param address - address to get count for
     * @param maxPollsCount - max number of result checking attempts
     * @return {Promise<number>} - number of transactions
     */
    async getTransactionsCountByAddress(address, maxPollsCount = null) {
        try {
            this._actualizeConfirmationsNumber();
            const transactionsList = await this.getTransactionsByAddresses([address], true, maxPollsCount);
            return transactionsList.length;
        } catch (e) {
            improveAndRethrow(e, "getTransactionsCountByAddress");
        }
    }

    /**
     * Retrieves details of transaction by its id. The transaction should be inside the local cache.
     *
     * @param txId - id of tx to get data for
     * @return {Promise<Transaction>} - Transaction object with details or null if is not found.
     */
    async getTransactionData(txId) {
        try {
            this._actualizeConfirmationsNumber();
            if (!this._transactionsData.find(tx => tx.txid === txId)) {
                const retrievedTx = await retrieveTransactionData(txId, getCurrentNetwork());
                this._transactionsData = improveRetrievedRawTransactionsData([retrievedTx], this._transactionsData);
            }

            return this._transactionsData.find(tx => tx.txid === txId);
        } catch (e) {
            improveAndRethrow(e, "getTransactionData");
        }
    }

    /**
     * Calculates a set of UTXOs by given addresses
     *
     * @param addresses - addresses set to get UTXO's for
     * @return {Promise<Array<Output>>} returns array of Output objects
     */
    getUTXOsByAddressesArray(addresses) {
        try {
            this._actualizeConfirmationsNumber();
            const getData = provider => {
                const outputsData = addresses.map(address => {
                    const scannedTxs = [];
                    const outputs = provider._transactionsData.map(tx => {
                        if (
                            (tx.double_spend && !(tx.confirmations > 0) && !tx.is_most_probable_double_spend) ||
                            scannedTxs.includes(tx.txid)
                        )
                            return [];
                        scannedTxs.push(tx.txid);

                        const matchedOutputs = tx.outputs.filter(output => output.addresses.includes(address));
                        return matchedOutputs
                            .filter(
                                output =>
                                    output.spend_txid == null && // Double check as some providers gives no data about txs spending
                                    getTXIDSendingGivenOutput(output, tx.txid, provider._transactionsData) == null
                            )
                            .map(
                                output =>
                                    new Utxo(
                                        tx.txid,
                                        output.number,
                                        output.value_satoshis,
                                        tx.confirmations,
                                        output.type,
                                        output.addresses[0]
                                    )
                            );
                    });
                    return outputs.flat();
                });
                return outputsData
                    .flat()
                    .map(d => new Utxo(d.txid, d.number, d.value_satoshis, d.confirmations, d.type, d.address));
            };

            return new Promise((resolve, reject) =>
                returnOrPostpone(this, getData, this.pollingIntervalMS, resolve, reject)
            );
        } catch (e) {
            improveAndRethrow(e, "getUTXOsByAddressesArray");
        }
    }

    /**
     * Notifies about new transactions created not locally. The transaction can be either incoming or
     * externally created outgoing transaction.
     *
     * @param newData - Array - new retrieved transactions list
     * @private
     */
    _notifyAboutNewIncomingTransactions(newData) {
        const newTxs = newData.filter(
            newTx => !this._transactionsData.find(tx => tx.txid === newTx.txid) && newTx.confirmations === 0
        );
        newTxs.length && EventBus.dispatch(NEW_NOT_LOCAL_TRANSACTIONS_EVENT);
    }
}

/**
 * Resolves and returns data if data fetching is finished and data array is not empty or schedules
 * new polling iteration.
 *
 * @param provider - the TransactionsDataProvider instance
 * @param callback - callback to get data from the provider
 * @param timeout - polling interval, MS
 * @param resolve - resolve callback of wrapper-promise
 * @param reject - reject callback of wrapper-promise
 * @param callsCount - internal, indicates polling attempt number
 * @param maxPollsCount - custom max number of polls
 */
function returnOrPostpone(provider, callback, timeout, resolve, reject, callsCount = 0, maxPollsCount = null) {
    try {
        const maxCallsCount = maxPollsCount || provider.maxPollsCount;
        if (provider._isInitialized) {
            resolve(callback(provider));
        } else if (callsCount >= maxCallsCount) {
            reject(new Error("Max calls count exceeded."));
        } else {
            setTimeout(
                () => returnOrPostpone(provider, callback, timeout, resolve, reject, callsCount + 1, maxCallsCount),
                timeout
            );
        }
    } catch (e) {
        improveAndRethrow(e, "returnOrPostpone");
    }
}

const improveRetrievedRawTransactionsData = (newData, oldData, isNewDataStoredOnServer = false) => {
    newData.forEach(tx => (tx.isStoredOnServer = isNewDataStoredOnServer));
    oldData.forEach(tx => {
        if (!newData.find(newTx => tx.txid === newTx.txid)) {
            // Note that declined transactions can be persisted here (like ones replaced by fee, use .double_spend to check)
            newData.push(tx);
        }
    });

    setDoubleSpendFlag(newData);
    setSpendTxId(newData);

    const preparedData = removeDeclinedDoubleSpendingTransactionsFromList(newData);
    if (preparedData.find(tx => !oldData.find(oldTx => tx.txid === oldTx.txid))) {
        EventBus.dispatch(TX_DATA_RETRIEVED_EVENT);
    }

    return preparedData;
};

export const transactionsDataProvider = new TransactionsDataProvider();
