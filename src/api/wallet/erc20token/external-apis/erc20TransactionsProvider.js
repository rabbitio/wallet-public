import { BigNumber } from "bignumber.js";

import {
    AmountUtils,
    improveAndRethrow,
    CachedRobustExternalApiCallerService,
    ExternalApiProvider,
    ApiGroups,
} from "@rabbitio/ui-kit";

import { TransactionsHistoryItem } from "../../common/models/transactionsHistoryItem.js";
import {
    actualizeCacheWithNewTransactionSentFromAddress,
    mergeTwoArraysByItemIdFieldName,
    mergeTwoTransactionsArraysAndNotifyAboutNewTransactions,
} from "../../common/utils/cacheActualizationUtils.js";
import { Coins } from "../../coins.js";
import { Storage } from "../../../common/services/internal/storage.js";
import { provideFirstSeenTime } from "../../common/external-apis/utils/firstSeenTimeHolder.js";
import { STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS } from "../../../common/utils/ttlConstants.js";
import { cache } from "../../../common/utils/cache.js";

/**
 * Currently we use free version of this provider. But we have API key with 100k requests free per month.
 * If we decide to use paid option add API key to query string: '&apikey=${"api_key"}'
 *
 * Params for this provider's endpoint are:
 *   params[0] {string} address to get txs for
 *   params[1] {number} page number to start from, it counts from 1
 */
class EtherScanErc20TransactionsProvider extends ExternalApiProvider {
    constructor() {
        super("https://api.etherscan.io/api", "get", 20000, ApiGroups.ETHERSCAN, {}, 100);
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            if (Storage.getCurrentNetwork(Coins.COINS.ETH) !== Coins.COINS.ETH.mainnet) {
                throw new Error("Etherscan doesn't support testnet for ethereum blockchain");
            }
            const pageNumber = params[1] ?? 1;
            return `?module=account&action=tokentx&address=${params[0]}&page=${pageNumber}&offset=${this.maxPageLength}`;
        } catch (e) {
            improveAndRethrow(e, "etherScanErc20TransactionsProvider.composeQueryString");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            const txs = response?.data?.result;

            if (!Array.isArray(txs)) {
                throw new Error("Failed to get erc20 transactions list - wrong format from etherscan");
            }

            const myAddressLowercase = params[0].toLowerCase();
            return txs
                .map(tx => {
                    const coin = Coins.getSupportedCoinsList().find(c => tx.contractAddress === c.tokenAddress);
                    if (!coin || (tx.to !== myAddressLowercase && tx.from !== myAddressLowercase)) {
                        // Means coin is not supported or this transfer is not related to given address
                        return [];
                    }
                    const isSendingAndReceiving = tx.to === tx.from;
                    const composeItem = type =>
                        new TransactionsHistoryItem(
                            tx.hash,
                            coin.ticker,
                            coin.tickerPrintable,
                            type,
                            AmountUtils.trim(tx.value, 0),
                            tx.confirmations ? +tx.confirmations : 0,
                            tx.timeStamp ? +tx.timeStamp * 1000 : provideFirstSeenTime(tx.hash),
                            tx.to,
                            tx.gasUsed != null ? AmountUtils.trim(BigNumber(tx.gasUsed).times(tx.gasPrice), 0) : null,
                            tx,
                            false,
                            isSendingAndReceiving
                        );
                    const type = tx.to.toLowerCase() === myAddressLowercase ? "in" : "out";
                    return isSendingAndReceiving ? [composeItem("in"), composeItem("out")] : [composeItem(type)];
                })
                .flat();
        } catch (e) {
            improveAndRethrow(e, "etherScanErc20TransactionsProvider.getDataByResponse");
        }
    }

    doesSupportPagination() {
        return true;
    }

    changeQueryParametersForPageNumber(params, previousResponse, pageNumber, subRequestIndex = 0) {
        // NOTE: EtherScan uses page numbers starting with 1 (not with 0)
        return [params[0], pageNumber + 1];
    }

    checkWhetherResponseIsForLastPage(previousResponse, currentResponse, currentPageNumber, subRequestIndex = 0) {
        return (currentResponse?.data?.result?.length ?? 0) < this.maxPageLength;
    }
}

// TODO: [tests, moderate] implement units/integration tests
export class Erc20TransactionsProvider {
    static _provider = new CachedRobustExternalApiCallerService(
        "erc20TransactionsProvider",
        cache,
        [new EtherScanErc20TransactionsProvider()],
        STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS,
        false,
        mergeTwoTransactionsArraysAndNotifyAboutNewTransactions
    );

    /**
     * Retrieves ethereum transactions sending given erc20 token for given address
     *
     * @param address {string} ethereum address to get transactions for
     * @param cancelProcessor {CancelProcessing} canceller if you need to control execution outside
     * @returns {Promise<TransactionsHistoryItem[]>} history items
     */
    static async getErc20TransactionsByAddress(address, cancelProcessor = null) {
        try {
            return await this._provider.callExternalAPICached(
                this._calculateParamsArray(address),
                15000,
                cancelProcessor?.getToken(),
                1,
                hashFunctionForParams
            );
        } catch (e) {
            improveAndRethrow(e, "getErc20TransactionsByAddress");
        }
    }

    /**
     * Puts the just sent transaction by given data to cache to force it to appear in the app as fast as possible.
     *
     * @param coin {Coin} sent coin
     * @param address {string} the sending address
     * @param txData {TxData} the TxData object used to send a transaction
     * @param txId {string} the id of transaction
     */
    static actualizeCacheWithNewTransaction(coin, address, txData, txId) {
        try {
            const cacheProcessor = actualizeCacheWithNewTransactionSentFromAddress(coin, address, txData, txId);
            this._provider.actualizeCachedData(
                this._calculateParamsArray(address),
                cacheProcessor,
                hashFunctionForParams
            );
        } catch (e) {
            improveAndRethrow(e, "erc20TransactionsProvider.actualizeCacheWithNewTransaction");
        }
    }

    static _calculateParamsArray(address) {
        return [address, 1];
    }

    static actualizeCacheWithTransactionsReturnedByAnotherProvider(address, transactions) {
        try {
            this._provider.actualizeCachedData(
                this._calculateParamsArray(address),
                cache => ({ data: mergeTwoArraysByItemIdFieldName(cache, transactions, "txid"), isModified: true }),
                hashFunctionForParams,
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
            this._provider.markCacheAsExpiredButDontRemove(this._calculateParamsArray(address), hashFunctionForParams);
        } catch (e) {
            improveAndRethrow(e, "markCacheAsExpired");
        }
    }
}

const hashFunctionForParams = paramsArray => `erc20_only_transactions_${paramsArray[0]}`;
