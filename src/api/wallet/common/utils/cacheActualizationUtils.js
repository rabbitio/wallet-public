import { BigNumber } from "bignumber.js";

import { AmountUtils, improveAndRethrow, Logger } from "@rabbitio/ui-kit";

import { TransactionsHistoryItem } from "../models/transactionsHistoryItem.js";
import {
    BALANCE_CHANGED_EXTERNALLY_EVENT,
    EventBus,
    NEW_NOT_LOCAL_TRANSACTIONS_EVENT,
} from "../../../common/adapters/eventbus.js";

/**
 * Merges old data array with new by adding the missing items from old array and all new items
 *
 * @param oldItemsArray {Object[]} list of items, each item should have idFieldName property
 * @param newItemsArray {Object[]} list of items, each item should have idFieldName property
 * @param [idFieldName="txid"] {string} name of the filed on item object that is id of the item
 * @param [handleNewItems=null] {function} optional function to call if there is new items not present in old items array
 * @param [handleNewValues=null] {function} optional function to call if there is new values for existing items
 * @param [valueFieldName=null] {function} optional field name to check its value is changed
 * @returns {any[]} merged list of items
 */
export function mergeTwoArraysByItemIdFieldName(
    oldItemsArray,
    newItemsArray,
    idFieldName = "txid",
    handleNewItems = null,
    handleNewValues = null,
    valueFieldName = null
) {
    try {
        const shouldHandleNewItems = typeof handleNewItems === "function";
        const safeHandleNewItems = newItems => {
            try {
                shouldHandleNewItems && handleNewItems(newItems);
            } catch (e) {
                Logger.logError(e, "safeHandleNewItems");
            }
        };

        const shouldHandleNewValues = typeof handleNewValues === "function" && typeof valueFieldName === "string";
        const safeHandleNewValues = itemsHavingNewValues => {
            try {
                shouldHandleNewValues && handleNewValues(itemsHavingNewValues);
            } catch (e) {
                Logger.logError(e, "safeHandleNewValues");
            }
        };

        const itemsHavingChangedValues = [];
        if (oldItemsArray?.length && newItemsArray?.length) {
            const merged = [...newItemsArray];
            // Add cached transactions missing in the new transactions list. This is useful when we push just sent transaction to cache
            oldItemsArray.forEach(cachedItem => {
                // Here we add only objects having idFieldName field and ignoring all other values
                let oldItemInNewArray = undefined;
                if (cachedItem != null && typeof cachedItem === "object" && cachedItem[idFieldName] != null) {
                    oldItemInNewArray = newItemsArray.find(
                        newItem =>
                            newItem != null &&
                            typeof newItem === "object" &&
                            newItem[idFieldName] != null &&
                            newItem[idFieldName] === cachedItem[idFieldName]
                    );
                    oldItemInNewArray = oldItemInNewArray ?? null;
                }
                if (oldItemInNewArray === null) {
                    // Adding only old item that is object having id filed but not present in new array
                    merged.push(cachedItem);
                } else if (
                    shouldHandleNewValues &&
                    oldItemInNewArray !== undefined &&
                    oldItemInNewArray[valueFieldName] !== cachedItem[valueFieldName]
                ) {
                    itemsHavingChangedValues.push([cachedItem, oldItemInNewArray]);
                }
            });

            if (shouldHandleNewValues && itemsHavingChangedValues.length) {
                safeHandleNewValues(itemsHavingChangedValues);
            }

            if (shouldHandleNewItems && merged.length > oldItemsArray.length) {
                const newItems = newItemsArray.filter(
                    newItem =>
                        newItem != null &&
                        typeof newItem === "object" &&
                        !oldItemsArray.find(
                            oldItem =>
                                oldItem != null &&
                                typeof oldItem === "object" &&
                                oldItem[idFieldName] === newItem[idFieldName]
                        )
                );
                // TODO: [feature, moderate] we have several cache items containing transactions (when loading for
                //       all tokens or for each token separately) so we need to handle this here - maybe use single
                //       tokens cache. task_id=323ad5dd9ca74f608ccba1e7dd5f073f
                safeHandleNewItems(newItems);
            }

            return merged;
        } else if (shouldHandleNewItems && oldItemsArray?.length === 0 && newItemsArray?.length) {
            safeHandleNewItems(newItemsArray);
        }

        return Array.isArray(newItemsArray) && (newItemsArray.length || !Array.isArray(oldItemsArray))
            ? newItemsArray
            : oldItemsArray;
    } catch (e) {
        improveAndRethrow(e, "mergeTwoArraysByItemIdFieldName");
    }
}

export function mergeTwoTransactionsArraysAndNotifyAboutNewTransactions(oldItemsArray, newItemsArray) {
    try {
        const notifyAboutNewItemsDiscoveredDuringMerge = newTransactions => {
            EventBus.dispatch(NEW_NOT_LOCAL_TRANSACTIONS_EVENT, null, newTransactions);
        };

        return mergeTwoArraysByItemIdFieldName(
            oldItemsArray,
            newItemsArray,
            "txid",
            notifyAboutNewItemsDiscoveredDuringMerge
        );
    } catch (e) {
        improveAndRethrow(e, "mergeTwoTransactionsArraysAndNotifyAboutNewTransactions");
    }
}

export function mergeSingleBalanceValuesAndNotifyAboutValueChanged(cachedValue, newValue, ticker) {
    try {
        if (newValue == null) {
            return cachedValue;
        }
        if (cachedValue != null && newValue !== cachedValue) {
            EventBus.dispatch(BALANCE_CHANGED_EXTERNALLY_EVENT, null, [ticker]);
        }
        return newValue;
    } catch (e) {
        improveAndRethrow(e, "mergeSingleBalanceValuesAndNotifyAboutValueChanged");
    }
}

export function mergeTwoBalancesArraysAndNotifyAboutBalanceValueChange(oldItemsArray, newItemsArray) {
    try {
        const notifyAboutNewItemsDiscoveredDuringMerge = oldAndNewPairs => {
            const tickers = oldAndNewPairs.map(item => item[0]?.ticker ?? []).flat();
            EventBus.dispatch(BALANCE_CHANGED_EXTERNALLY_EVENT, null, tickers);
        };

        return mergeTwoArraysByItemIdFieldName(
            oldItemsArray,
            newItemsArray,
            "ticker",
            null,
            notifyAboutNewItemsDiscoveredDuringMerge,
            "balance"
        );
    } catch (e) {
        improveAndRethrow(e, "mergeTwoBalancesArraysAndNotifyAboutBalanceValueChange");
    }
}

/**
 * Puts the just sent transaction by given data to cache to force it to appear in the app as fast as possible.
 *
 * @param coin {Coin} sent coin
 * @param address {string} the sending address
 * @param txData {TxData} the TxData object used to send a transaction
 * @param txId {string} the id of just sent transaction
 * @return {function}
 *
 * TODO: [refactoring, moderate] rename
 */
export function actualizeCacheWithNewTransactionSentFromAddress(coin, address, txData, txId) {
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

        return currentCache => {
            try {
                const list = Array.isArray(currentCache) ? currentCache : [];
                list.push(txForCache);
                return {
                    data: list,
                    isModified: true,
                };
            } catch (e) {
                improveAndRethrow(e, `cacheProcessor:${coin.ticker}${address}`);
            }
        };
    } catch (e) {
        improveAndRethrow(e, "actualizeCacheWithNewTransactionSentFromAddress");
    }
}

export function createRawBalanceAtomsCacheProcessorForMultiBalancesProvider(coin, valuesAtoms, sign) {
    return cachedList => {
        try {
            if (Array.isArray(cachedList)) {
                const coinBalanceData = cachedList.find(item => item?.ticker === coin.ticker);
                if (coinBalanceData?.balance) {
                    const balance = BigNumber(coinBalanceData.balance);
                    valuesAtoms = "" + valuesAtoms;
                    let bigNumber;
                    if (sign < 0) {
                        bigNumber = balance.gte(valuesAtoms) ? balance.minus(valuesAtoms) : BigNumber("0");
                    } else {
                        bigNumber = balance.plus(valuesAtoms);
                    }
                    coinBalanceData.balance = AmountUtils.trim(bigNumber, 0);

                    return { isModified: true, data: cachedList };
                }
            }

            return { isModified: false, data: cachedList };
        } catch (e) {
            improveAndRethrow(e, "RawBalanceAtomsCacheProcessorForMultiBalancesProvider");
        }
    };
}

export function createRawBalanceAtomsCacheProcessorForSingleBalanceProvider(valuesAtoms, sign) {
    return cached => {
        try {
            let data = cached;
            if (typeof cached === "string" || typeof cached === "number") {
                const balance = BigNumber("" + cached);
                if (sign < 0) {
                    data = balance.gte(valuesAtoms) ? balance.minus(valuesAtoms) : BigNumber("0");
                } else {
                    data = balance.plus(valuesAtoms);
                }
                data = AmountUtils.trim(data, 0);

                return { isModified: true, data: data };
            }

            return { isModified: false, data: data };
        } catch (e) {
            improveAndRethrow(e, "RawBalanceAtomsCacheProcessorForSingleBalanceProvider");
        }
    };
}
