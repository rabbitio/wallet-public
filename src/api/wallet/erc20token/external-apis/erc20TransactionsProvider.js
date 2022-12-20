import { BigNumber } from "ethers";

import { ETH_PR_K_ETHSCAN } from "../../../../properties";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { TransactionsHistoryItem } from "../../common/models/transactionsHistoryItem";
import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";

/**
 * TODO: [feature, critical] check for pagination. task_id=b10ff856bea04ebca54a1d284d24196d
 * Params for this provider's endpoint are:
 *   params[0] {Coin} coin to get txs for
 *   params[1] {string} address to get txs for
 *   params[2] {number} page number to start from, it counts from 1
 */
class EtherScanErc20TransactionsProvider extends ExternalApiProvider {
    composeQueryString(params, subRequestIndex = 0) {
        return `?module=account&action=tokentx&contractaddress=${params[0]?.tokenAddress}&address=${
            params[1]
        }&page=${params[2] ?? 1}&offset=${this.maxPageLength}&apikey=${ETH_PR_K_ETHSCAN}`;
    }

    getDataByResponse(response, params = [], subRequestIndex = 0) {
        const txs = response?.data?.result;

        if (!txs || !Array.isArray(txs)) {
            return [];
        }

        const myAddressLowercase = params[1].toLowerCase();
        const notFlatTxs = txs.map(tx => {
            const composeItem = (type, sendingAndReceiving = false) =>
                new TransactionsHistoryItem(
                    tx.hash,
                    params[0].ticker,
                    params[0].tickerPrintable,
                    type,
                    tx.value,
                    tx.confirmations,
                    +tx.timeStamp * 1000,
                    tx.to,
                    BigNumber.from(tx.gasUsed)
                        .mul(tx.gasPrice)
                        .toString(),
                    tx,
                    false,
                    sendingAndReceiving
                );
            const historyItems = [composeItem(tx.to.toLowerCase() === myAddressLowercase ? "in" : "out")];
            if (tx.to === tx.from) {
                historyItems[0].isSendingAndReceiving = true;
                historyItems.push(composeItem("out", true));
            }

            return historyItems;
        });

        return notFlatTxs.flat();
    }

    doesSupportPagination() {
        return true;
    }

    changeQueryParametersForPageNumber(params, previousResponse, pageNumber, subRequestIndex = 0) {
        // NOTE: EtherScan uses page numbers starting with 1 (not with 0)
        return [params[0], params[1], pageNumber];
    }

    checkWhetherResponseIsForLastPage(previousResponse, currentResponse, currentPageNumber, subRequestIndex = 0) {
        return (currentResponse?.data?.result?.length ?? 0) < this.maxPageLength;
    }
}

// TODO: [tests, moderate] implement units/integration tests
export class Erc20TransactionsProvider {
    static _provider = new CachedRobustExternalApiCallerService(
        "erc20TransactionsProvider",
        [new EtherScanErc20TransactionsProvider("https://api.etherscan.io/api", "get", 20000, 3, 100)],
        30000,
        20,
        1000,
        false,
        mergeCachedErc20TransactionsWithNew
    );

    /**
     * Retrieves ethereum transactions sending given erc20 token for given address
     *
     * @param coin {Coin} ERC20 token to get transactions for
     * @param address {string} ethereum address to gt transactions for
     * @param cancelProcessor {CancelProcessing} canceller if you need to control execution outside
     * @returns {Promise<TransactionsHistoryItem[]>} history items
     */
    static async getErc20TransactionsByAddress(coin, address, cancelProcessor = null) {
        try {
            return await this._provider.callExternalAPICached(
                this._calculateParamsArray(coin, address),
                16000,
                cancelProcessor?.getToken(),
                2,
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
    static actualizeCacheWithNewTransactionSentFromAddress(coin, address, txData, txId) {
        try {
            const txForCache = new TransactionsHistoryItem(
                txId,
                coin.ticker,
                coin.tickerPrintable,
                "out",
                txData.amount,
                0,
                Date.now(),
                txData.address,
                txData.fee,
                null,
                false,
                address === txData.address
            );
            const cacheProcessor = currentCache => {
                try {
                    currentCache.push(txForCache);
                    return {
                        data: currentCache,
                        isModified: true,
                    };
                } catch (e) {
                    improveAndRethrow(e, "cacheActualizationHandler for erc20TransactionsProvider");
                }
            };
            this._provider.actualizeCachedData(
                this._calculateParamsArray(coin, address),
                cacheProcessor,
                hashFunctionForParams
            );
        } catch (e) {
            improveAndRethrow(e, "actualizeCacheWithNewTransactionSentFromAddress");
        }
    }

    static _calculateParamsArray(coin, address) {
        return [coin, address, 1];
    }
}

const hashFunctionForParams = paramsArray => `${paramsArray[0]?.ticker}_${paramsArray[1]}`;

function mergeCachedErc20TransactionsWithNew(cachedData, newData) {
    try {
        if (cachedData?.length && newData?.length) {
            const merged = [...newData];
            // Add cached transactions missing in the returned transactions list. This is useful when we push just sent transaction to cache
            cachedData.forEach(cachedTx => {
                if (!newData.find(newTx => newTx.hash === cachedTx.hash)) {
                    merged.push(cachedTx);
                }
            });
            return merged;
        }
        return newData || cachedData;
    } catch (e) {
        improveAndRethrow(e, "mergeCachedErc20TransactionsWithNew");
    }
}

export function createErc20TransactionsProviderForTesting(params) {
    return new CachedRobustExternalApiCallerService(
        "erc20TransactionsProvider",
        [new EtherScanErc20TransactionsProvider(...params)],
        10000,
        20,
        1000
    );
}
