import { BigNumber } from "bignumber.js";

import { AmountUtils, improveAndRethrow } from "@rabbitio/ui-kit";

import { Storage } from "../../../common/services/internal/storage.js";
import { Coins } from "../../coins.js";
import { EthTransactionsUtils } from "../lib/ethTransactionsUtils.js";
import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider.js";
import { TransactionsHistoryItem } from "../../common/models/transactionsHistoryItem.js";
import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService.js";
import {
    actualizeCacheWithNewTransactionSentFromAddress,
    mergeTwoArraysByItemIdFieldName,
    mergeTwoTransactionsArraysAndNotifyAboutNewTransactions,
} from "../../common/utils/cacheActualizationUtils.js";
import { provideFirstSeenTime } from "../../common/external-apis/utils/firstSeenTimeHolder.js";
import { ApiGroups } from "../../../common/external-apis/apiGroups.js";
import { STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS } from "../../../common/utils/ttlConstants.js";

class EtherscanEthTransactionsProvider extends ExternalApiProvider {
    constructor() {
        /**
         * This provider actually returns 10000 txs per request.
         * Also, we can use API key providing 100000 monthly free requests.
         * But we are using it without API key to not pay for it.
         *
         * Also note that this provider uses two endpoints for ordinary and internal transactions,
         * so we use two http methods and further processing.
         */
        super("", ["get", "get"], 15000, ApiGroups.ETHERSCAN, null, 10000);
    }

    doesRequireSubRequests() {
        return true;
    }

    doesSupportPagination() {
        return true;
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const networkPrefix =
                Storage.getCurrentNetwork(Coins.COINS.ETH) === Coins.COINS.ETH.mainnet ? "" : "-goerli";
            const address = params[0];
            const page = params[1] ?? 1;
            const offset = this.maxPageLength * (page - 1);
            const moduleForSubRequest = subRequestIndex === 0 ? "txlist" : "txlistinternal";
            // NOTE: add api key if you decide to use paid API '&apikey=YourApiKeyToken'
            return `https://api${networkPrefix}.etherscan.io/api?module=account&action=${moduleForSubRequest}&address=${address}&page=${page}&offset=${offset}&sort=asc`;
        } catch (e) {
            improveAndRethrow(e, "etherscanTransactionsProvider.composeQueryString");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            const myAddress = params[0].toLowerCase();
            const txsList = response?.data?.result;
            if (!Array.isArray(txsList)) {
                throw new Error("Wrong format of transactions list for etherscan provider ETH");
            }
            if (subRequestIndex === 0) {
                return txsList
                    .map(tx => {
                        if (tx.value === "0" || (tx.to !== myAddress && tx.from !== myAddress)) {
                            // Means this transaction is not ETH transfer or not related to this address
                            return [];
                        }
                        const type = tx.to === myAddress ? "in" : "out";
                        const fee =
                            tx.gasUsed && tx.gasPrice
                                ? AmountUtils.trim(BigNumber(tx.gasUsed).times(tx.gasPrice), 0)
                                : null;
                        const isSendingAndReceiving = tx.to === tx.from;
                        const timestamp = tx.timeStamp ? +tx.timeStamp * 1000 : provideFirstSeenTime(tx.hash);
                        const composeTx = type =>
                            new TransactionsHistoryItem(
                                tx.hash,
                                Coins.COINS.ETH.ticker,
                                Coins.COINS.ETH.tickerPrintable,
                                type,
                                tx.value,
                                tx.confirmations,
                                timestamp,
                                tx.to,
                                fee,
                                tx,
                                false,
                                isSendingAndReceiving
                            );
                        return isSendingAndReceiving ? [composeTx("in"), composeTx("out")] : [composeTx(type)];
                    })
                    .flat();
            } else {
                // Adding internal transactions sending/receiving ETH
                return txsList
                    .map(tx => {
                        const type = tx.to === myAddress ? "in" : "out";
                        const confirmations =
                            tx.timeStamp && tx.blockNumber
                                ? EthTransactionsUtils.estimateEthereumConfirmationsByTimestamp(+tx.timeStamp * 1000)
                                : 0;
                        const fee = null; // As this provider doesn't return clear fee for internal transactions
                        const isSendingAndReceiving = tx.to === tx.from;
                        const timestamp = tx.timeStamp ? +tx.timeStamp * 1000 : provideFirstSeenTime(tx.hash);
                        const internalTxItem = type =>
                            new TransactionsHistoryItem(
                                tx.hash,
                                Coins.COINS.ETH.ticker,
                                Coins.COINS.ETH.tickerPrintable,
                                type,
                                tx.value,
                                confirmations,
                                timestamp,
                                tx.to,
                                fee,
                                tx,
                                false,
                                isSendingAndReceiving
                            );
                        return isSendingAndReceiving
                            ? [internalTxItem("in"), internalTxItem("out")]
                            : [internalTxItem(type)];
                    })
                    .flat();
            }
        } catch (e) {
            improveAndRethrow(e, "etherscanTransactionsProvider.getDataByResponse");
        }
    }

    changeQueryParametersForPageNumber(params, previousResponse, pageNumber, subRequestIndex = 0) {
        try {
            const address = params[0];
            return [address, pageNumber];
        } catch (e) {
            improveAndRethrow(e, "etherscanTransactionsProvider.changeQueryParametersForPageNumber");
        }
    }

    checkWhetherResponseIsForLastPage(previousResponse, currentResponse, currentPageNumber, subRequestIndex = 0) {
        try {
            return (currentResponse?.data?.result?.length ?? 0) < this.maxPageLength;
        } catch (e) {
            improveAndRethrow(e, "etherscanTransactionsProvider.checkWhetherResponseIsForLastPage");
        }
    }
}

// TODO: [tests, moderate] implement units/integration tests
export class EthTransactionsProvider {
    static _provider = new CachedRobustExternalApiCallerService(
        "ethTransactionsProvider",
        [new EtherscanEthTransactionsProvider()],
        STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS,
        false,
        mergeTwoTransactionsArraysAndNotifyAboutNewTransactions
    );

    /**
     * Retrieves ethereum transactions sending ether for given address
     *
     * @param address {string} ethereum address to gt transactions for
     * @returns {Promise<TransactionsHistoryItem[]>} history items
     */
    static async getEthTransactionsByAddress(address) {
        try {
            return await this._provider.callExternalAPICached([address], 15000, null, 1, customHashFunctionForParams);
        } catch (e) {
            improveAndRethrow(e, "getEthTransactionsByAddress");
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
            const cacheProcessor = actualizeCacheWithNewTransactionSentFromAddress(
                Coins.COINS.ETH,
                address,
                txData,
                txId
            );
            this._provider.actualizeCachedData([address], cacheProcessor, customHashFunctionForParams);
        } catch (e) {
            improveAndRethrow(e, "actualizeCacheWithNewTransactionSentFromAddress");
        }
    }

    static actualizeCacheWithTransactionsReturnedByAnotherProvider(address, transactions) {
        try {
            this._provider.actualizeCachedData(
                [address],
                cache => ({ data: mergeTwoArraysByItemIdFieldName(cache, transactions, "txid"), isModified: true }),
                customHashFunctionForParams,
                true,
                Date.now()
            );
        } catch (e) {
            improveAndRethrow(e, "actualizeCacheWithTransactionsReturnedByAnotherProvider");
        }
    }

    /**
     * @param address {string}
     */
    static markCacheAsExpired(address) {
        try {
            this._provider.markCacheAsExpiredButDontRemove([address], customHashFunctionForParams);
        } catch (e) {
            improveAndRethrow(e, "markCacheAsExpired");
        }
    }
}

const customHashFunctionForParams = params => `eth_txs_list_${params[0]}_b94059fd-2170-46f1-8917-b9611c22ef11`;
