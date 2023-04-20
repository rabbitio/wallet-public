import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { TransactionsHistoryItem } from "../models/transactionsHistoryItem";

/**
 * Merges old data array with new by adding the missing transactions from old array and all new transactions
 *
 * @param oldTxsArray {any[]} list of transaction objects, each tx should have idFieldName property
 * @param newTxsArray {any[]} list of transaction objects, each tx should have idFieldName property
 * @param [idFieldName="hash"] {string} name of the filed on transaction object that is id of the transaction
 * @returns {any[]} merged list of transactions
 */
export function mergeTwoArraysByItemIdFieldName(oldTxsArray, newTxsArray, idFieldName = "hash") {
    try {
        if (oldTxsArray?.length && newTxsArray?.length) {
            const merged = [...newTxsArray];
            // Add cached transactions missing in the new transactions list. This is useful when we push just sent transaction to cache
            oldTxsArray.forEach(cachedTx => {
                if (!newTxsArray.find(newTx => newTx[idFieldName] === cachedTx[idFieldName])) {
                    merged.push(cachedTx);
                }
            });

            return merged;
        }
        return newTxsArray || oldTxsArray;
    } catch (e) {
        improveAndRethrow(e, "mergeTwoArraysByItemIdFieldName");
    }
}
/**
 * Puts the just sent transaction by given data to cache to force it to appear in the app as fast as possible.
 *
 * @param provider {CachedRobustExternalApiCallerService} provider instance used by specific service using this function
 * @param params {any[]} array of params the same as it is passed to the provider for data retrieval
 * @param hashFunctionForParams {function} accepting params array and returning hash string
 * @param coin {Coin} sent coin
 * @param address {string} the sending address
 * @param txData {TxData} the TxData object used to send a transaction
 * @param txId {string} the id of just sent transaction
 * @return {void}
 */
export function actualizeCacheWithNewTransactionSentFromAddress(
    provider,
    params,
    hashFunctionForParams,
    coin,
    address,
    txData,
    txId
) {
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
                improveAndRethrow(e, `cacheProcessor:${coin.ticker}${address}`);
            }
        };
        provider.actualizeCachedData(params, cacheProcessor, hashFunctionForParams);
    } catch (e) {
        improveAndRethrow(e, "actualizeCacheWithNewTransactionSentFromAddress");
    }
}
