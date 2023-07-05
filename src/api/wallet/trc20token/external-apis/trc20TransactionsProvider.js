import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";
import { getCurrentNetwork } from "../../../common/services/internal/storage";
import { Coins } from "../../coins";
import { TransactionsHistoryItem } from "../../common/models/transactionsHistoryItem";
import { provideFirstSeenTime } from "../../common/external-apis/utils/firstSeenTimeHolder";
import {
    actualizeCacheWithNewTransactionSentFromAddress,
    mergeTwoTransactionsArraysAndNotifyAboutNewTransactions,
} from "../../common/utils/cacheActualizationUtils";
import { computeConfirmationsCountByTimestamp } from "../../trx/lib/blocks";
import { TRONGR_PR_K } from "../../../../properties";
import { ApiGroups } from "../../../common/external-apis/apiGroups";

class TronscanTrc20TransactionsProvider extends ExternalApiProvider {
    constructor() {
        const maxPageLength = 50; // Discovered by experiments
        super("", "get", 25000, ApiGroups.TRONSCAN, {}, maxPageLength);
    }

    doesSupportPagination() {
        return true;
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const network = getCurrentNetwork(Coins.COINS.TRX);
            if (network !== Coins.COINS.TRX.mainnet) {
                throw new Error("Tronscan doesn't support testnet");
            }
            const address = params[0];
            const offset = params[1] ?? 0;
            return `https://apilist.tronscan.org/api/contract/events?address=${address}&start=${offset}&limit=${this.maxPageLength}`;
        } catch (e) {
            improveAndRethrow(e, "TronscanTrc20TransactionsProvider.composeQueryString");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            const list = response?.data?.data;
            if (!Array.isArray(list)) {
                throw new Error("Wrong data format returned from tronscan provider for trc20 transactions list");
            }
            const address = params[0];
            return list
                .map(t => {
                    const isSendingAndReceiving = t.transferFromAddress === t.transferToAddress;
                    const probableType = t.transferToAddress === address ? "in" : "out";
                    let coin = null;
                    switch (t?.tokenName) {
                        case "Tether USD":
                            coin = Coins.COINS.USDTTRC20;
                            break;
                        case "Decentralized USD":
                            coin = Coins.COINS.USDDTRC20;
                            break;
                        case "BitTorrent":
                            coin = Coins.COINS.BTTTRC20;
                            break;
                        case "SUN":
                            coin = Coins.COINS.SUNTRC20;
                            break;
                        case "JUST":
                            coin = Coins.COINS.JSTTRC20;
                            break;
                        case "TrueUSD":
                            coin = Coins.COINS.TUSDTRC20;
                            break;
                        case "USD Coin":
                            coin = Coins.COINS.USDCTRC20;
                            break;
                        case "Wrapped TRX":
                            coin = Coins.COINS.WTRXTRC20;
                            break;
                        default:
                            break;
                    }
                    // === "Tether USD" ? Coins.COINS.USDTTRC20 : null;
                    if (!coin) {
                        // Means we don't support the discovered token
                        return [];
                    }
                    const confirmations = computeConfirmationsCountByTimestamp(t.timestamp);
                    const timestamp = t.timestamp ?? provideFirstSeenTime(t.transactionHash);
                    const tx = type =>
                        new TransactionsHistoryItem(
                            t.transactionHash,
                            coin.ticker,
                            coin.tickerPrintable,
                            type,
                            t.amount,
                            confirmations,
                            timestamp,
                            t.transferToAddress,
                            null,
                            t,
                            false,
                            isSendingAndReceiving,
                            false,
                            false
                        );
                    return isSendingAndReceiving ? [tx("in"), tx("out")] : tx(probableType);
                })
                .flat();
        } catch (e) {
            improveAndRethrow(e, "tronscanTrc20TransactionsProvider.getDataByResponse");
        }
    }

    checkWhetherResponseIsForLastPage(previousResponse, currentResponse, currentPageNumber, subRequestIndex = 0) {
        return (currentResponse?.data?.data?.length ?? 0) < this.maxPageLength;
    }

    changeQueryParametersForPageNumber(params, previousResponse, pageNumber, subRequestIndex = 0) {
        return [params[0], pageNumber * this.maxPageLength];
    }
}

class TrongridTrc20TransactionsProvider extends ExternalApiProvider {
    constructor() {
        super("", "get", 20000, ApiGroups.TRONGRID, { "TRON-PRO-API-KEY": TRONGR_PR_K }, 200);
    }

    doesSupportPagination() {
        return true;
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const nextPageLink = params[1];
            if (nextPageLink) {
                // Means this is call for second or more page, and we already added the link to next page provided by the provider
                return nextPageLink;
            }
            const networkPrefix = getCurrentNetwork(Coins.COINS.TRX) === Coins.COINS.TRX.mainnet ? "api" : "nile";
            return `https://${networkPrefix}.trongrid.io/v1/accounts/${params[0]}/transactions/trc20?limit=${this.maxPageLength}`;
        } catch (e) {
            improveAndRethrow(e, "trongridTrc20TransactionsProvider.composeQueryString");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            const list = response?.data?.data;
            const address = params[0];
            if (!Array.isArray(list))
                throw new Error("Wrong format of returned data for trongrid trc20 transactions retrieval");
            return list
                .map(t => {
                    const coin = Coins.getSupportedCoinsList().find(c => c.tokenAddress === t?.token_info?.address);
                    if (!coin) {
                        // Means the transaction is related to some not supported coin
                        return [];
                    }
                    const probableType = t.to === address ? "in" : "out";
                    const isSendingAndReceiving = t.to && t.to === t.from;
                    const timestamp = t.block_timestamp || provideFirstSeenTime(t.transaction_id);
                    const confirmations = computeConfirmationsCountByTimestamp(t.block_timestamp);
                    const tx = type =>
                        new TransactionsHistoryItem(
                            t.transaction_id,
                            coin.ticker,
                            coin.tickerPrintable,
                            type,
                            t.value,
                            confirmations,
                            timestamp,
                            t.to,
                            null, // They don't provide fee data :\
                            t,
                            false,
                            isSendingAndReceiving,
                            false,
                            false
                        );
                    return isSendingAndReceiving ? [tx("in"), tx("out")] : tx(probableType);
                })
                .flat();
        } catch (e) {
            improveAndRethrow(e, "trongridTrc20TransactionsProvider.getDataByResponse");
        }
    }

    checkWhetherResponseIsForLastPage(previousResponse, currentResponse, currentPageNumber, subRequestIndex = 0) {
        return currentResponse?.data?.meta?.links?.next == null;
    }

    changeQueryParametersForPageNumber(params, previousResponse, pageNumber, subRequestIndex = 0) {
        return [params[0], previousResponse?.data?.meta?.links?.next];
    }
}

export class Trc20TransactionsProvider {
    static _provider = new CachedRobustExternalApiCallerService(
        "trc20TransactionsProvider",
        [new TronscanTrc20TransactionsProvider(), new TrongridTrc20TransactionsProvider()],
        120000,
        130,
        1000,
        false,
        mergeTwoTransactionsArraysAndNotifyAboutNewTransactions
    );

    static async getTrc20Transactions(address) {
        try {
            return await this._provider.callExternalAPICached([address], 20000, null, 1, hashFunctionForParams);
        } catch (e) {
            improveAndRethrow(e, "getTrc20Transactions");
        }
    }

    static actualizeCacheWithNewTransaction(coin, address, txData, txId) {
        try {
            const cacheProcessor = actualizeCacheWithNewTransactionSentFromAddress(coin, address, txData, txId);
            this._provider.actualizeCachedData([address], cacheProcessor, hashFunctionForParams);
        } catch (e) {
            improveAndRethrow(e, "trc20TransactionsProvider.actualizeCacheWithNewTransaction");
        }
    }

    /**
     * @param address {string}
     */
    static markCacheAsExpired(address) {
        try {
            this._provider.markCacheAsExpiredButDontRemove([address], hashFunctionForParams);
        } catch (e) {
            improveAndRethrow(e, "markCacheAsExpired");
        }
    }
}

const hashFunctionForParams = params => `trc20-txs-${params[0]}`;
