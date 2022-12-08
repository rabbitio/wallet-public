import { improveAndRethrow } from "../../../../common/utils/errorUtils";
import { MAX_RBF_SEQUENCE } from "./build-transaction";
import { TransactionsHistoryItem } from "../../../common/models/transactionsHistoryItem";
import { Coins } from "../../../coins";

/**
 * Composes btc transactions history items
 *
 * @param allAddresses {{ internal: string[], external: string[] }} all addresses of the wallet
 * @param allTransactions {Object[]} transactions data list
 * @return {TransactionsHistoryItem[]} history items list
 */
export function composeTransactionsHistoryItems(allAddresses, allTransactions) {
    try {
        let historyItems = [];
        allTransactions.forEach(tx => {
            historyItems = historyItems.concat(getSendingHistoryItems(tx, allAddresses));
            historyItems = historyItems.concat(getReceivingHistoryItems(tx, allAddresses));
        });

        historyItems.sort((item1, item2) => item2.time - item1.time);

        return historyItems;
    } catch (e) {
        improveAndRethrow(e, "composeTransactionsHistoryItems");
    }
}

/**
 * Returns details of specific transaction retrieved from explorer. Adds some important
 * data - type, note etc.
 *
 * @param tx {Object} Transaction instance
 * @param allAddresses {{ internal: string[], external: string[]}} all used addresses
 * @return {TransactionsHistoryItem} extended transaction details
 */
export function getExtendedTransactionDetails(tx, allAddresses) {
    try {
        const isSending = isTransactionSending(tx, allAddresses);
        const historyItems = isSending
            ? getSendingHistoryItems(tx, allAddresses)
            : getReceivingHistoryItems(tx, allAddresses);

        historyItems[0].isSendingAndReceiving = isSending && isTransactionReceiving(tx, allAddresses);

        return historyItems[0];
    } catch (e) {
        improveAndRethrow(e, "getExtendedTransactionDetails");
    }
}

function getSendingHistoryItems(tx, allAddresses) {
    try {
        let historyItems = [];
        if (isTransactionSending(tx, allAddresses)) {
            tx.outputs.forEach(output => {
                if (isOutputSending(output, allAddresses.internal)) {
                    historyItems.push(composeHistoryItem(tx, output.value_satoshis, output.addresses[0], "out"));
                }
            });
        }

        return historyItems;
    } catch (e) {
        improveAndRethrow(e, "getSendingHistoryItems");
    }
}

// expecting that all inputs in the same transaction correspond to our wallet
// so if at least one of inputs sends our utxo we consider tx as sending for this wallet
function isTransactionSending(transaction, allAddresses) {
    for (let input of transaction.inputs) {
        for (let addressesList of [allAddresses.internal, allAddresses.external]) {
            for (let address of addressesList) {
                if (address === input.address) {
                    return true;
                }
            }
        }
    }

    return false;
}

function isTransactionReceiving(transaction, allAddresses) {
    for (let output of transaction.outputs) {
        for (let address of allAddresses.external) {
            if (output.addresses.find(outputAddress => outputAddress === address)) {
                return true;
            }
        }
    }

    return false;
}

// checks whether output is change or sending
function isOutputSending(output, internalAddresses) {
    for (let internalAddress of internalAddresses) {
        for (let outputAddress of output.addresses) {
            if (internalAddress === outputAddress) {
                return false;
            }
        }
    }

    return true;
}

function composeHistoryItem(tx, amount, address, type) {
    return new TransactionsHistoryItem(
        tx.txid,
        Coins.COINS.BTC.ticker,
        Coins.COINS.BTC.tickerPrintable,
        type,
        amount,
        tx.confirmations,
        tx.time,
        address,
        tx.fee_satoshis,
        tx,
        isTransactionRbfAble(tx),
        false,
        tx.double_spend,
        tx.is_most_probable_double_spend
    );
}

function getReceivingHistoryItems(tx, allAddresses) {
    try {
        let historyItems = [];
        tx.outputs.forEach(output => {
            output.addresses.forEach(outAddress => {
                for (let address of allAddresses.external) {
                    if (outAddress === address) {
                        historyItems.push(composeHistoryItem(tx, output.value_satoshis, output.addresses[0], "in"));
                        break;
                    }
                }
            });
        });

        return historyItems;
    } catch (e) {
        improveAndRethrow(e, "getReceivingHistoryItems");
    }
}

/**
 * Checks whether the RBF process can be applied for given transaction
 * @param transaction - Transaction to be checked
 *
 * @return boolean - true if the RBF can be done for the given transaction and false otherwise
 */
function isTransactionRbfAble(transaction) {
    return (
        transaction.confirmations === 0 &&
        (transaction.is_most_probable_double_spend == null || transaction.is_most_probable_double_spend === true) &&
        transaction.inputs.filter(input => input.sequence == null || input.sequence <= MAX_RBF_SEQUENCE).length > 0
    );
}
