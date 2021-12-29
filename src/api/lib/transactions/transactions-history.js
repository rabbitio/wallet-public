import { improveAndRethrow } from "../../utils/errorUtils";
import { MAX_RBF_SEQUENCE } from "./build-transaction";

export function getTransactionsHistory(allAddresses, allTransactions, txStoredData) {
    try {
        let historyItems = [];
        allTransactions.forEach(tx => {
            historyItems = historyItems.concat(getSendingHistoryItems(tx, allAddresses));
            historyItems = historyItems.concat(getReceivingHistoryItems(tx, allAddresses));
        });

        historyItems.sort((item1, item2) => item2.time - item1.time);
        historyItems = addPaymentDescriptionsToHistoryItems(historyItems, txStoredData);

        return historyItems;
    } catch (e) {
        improveAndRethrow(e, "getTransactionsHistory");
    }
}

/**
 * Returns details of specific transaction retrieved from explorer. Adds some important
 * data - type, note etc.
 *
 * @param tx - Transaction instance
 * @param allAddresses - all used addresses
 * @param txStoredData - additional transactions data from server
 * @return Object - extended transaction details
 */
export function getExtendedTransactionDetails(tx, allAddresses, txStoredData) {
    try {
        const isSending = isTransactionSending(tx, allAddresses);
        const historyItems = isSending
            ? getSendingHistoryItems(tx, allAddresses)
            : getReceivingHistoryItems(tx, allAddresses);

        const item = addPaymentDescriptionsToHistoryItems(historyItems, txStoredData)[0];
        item.isSendingAndReceiving = isSending && isTransactionReceiving(tx, allAddresses);

        return item;
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
    return {
        type,
        txid: tx.txid,
        amount,
        confirmations: tx.confirmations,
        time: tx.time,
        address, // TODO: [feature, low, multisignature] This code is affected
        fees: tx.fee_satoshis,
        double_spend: tx.double_spend,
        is_most_probable_double_spend: tx.is_most_probable_double_spend,
        isRbfAble: isTransactionRbfAble(tx),
        full_tx: tx,
    };
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

function addPaymentDescriptionsToHistoryItems(historyItems, txStoredData) {
    txStoredData.forEach(txData => {
        const matchedHistoryItem = historyItems.filter(item => item.txid === txData.transactionId)[0];
        matchedHistoryItem.description = txData.note;
    });

    return historyItems;
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
