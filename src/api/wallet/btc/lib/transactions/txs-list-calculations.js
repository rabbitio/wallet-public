import { getTXIDSendingGivenOutput } from "../utxos";
import { improveAndRethrow } from "../../../../common/utils/errorUtils";

/**
 * Removes unconfirmed double_spending transactions from list if there is confirmed one spending the same UTXO(s)
 *
 * @param transactions - {Array<Transaction>}
 * @return {Array<Transaction>}
 */
export function removeDeclinedDoubleSpendingTransactionsFromList(transactions) {
    try {
        const doubleSpending = transactions.filter(tx => tx.double_spend);
        const stillRelevantDoubleSpending = [];
        doubleSpending.forEach(tx => {
            const utxosData = tx.inputs.map(input => ({ txid: input.txid, number: input.output_number }));
            const spendingTheSameUTXO = doubleSpending.filter(
                candidate =>
                    candidate.txid !== tx.txid &&
                    candidate.inputs.find(candidateInput =>
                        utxosData.find(
                            utxo => utxo.txid === candidateInput.txid && utxo.number === candidateInput.output_number
                        )
                    )
            );
            const doubleSpendingGroup = [tx, ...spendingTheSameUTXO];
            const confirmedOne = doubleSpendingGroup.find(tx => tx.confirmations > 0);
            if (confirmedOne) {
                stillRelevantDoubleSpending.push(confirmedOne);
            } else {
                stillRelevantDoubleSpending.push(tx);
            }
        });

        return transactions.filter(
            tx => !tx.double_spend || stillRelevantDoubleSpending.find(dsTx => tx.txid === dsTx.txid)
        );
    } catch (e) {
        improveAndRethrow(e, "removeDeclinedDoubleSpendingTransactionsFromList");
    }
}

/**
 * Analyses given transactions list to recognize double spending ones and fills the double_spend flag. If each
 * double spend group does not contain confirmed transaction than the is_most_probable_double_spend
 * is being set for the one having highest fee.
 *
 * NOTE: this function modifies given array!

 * @param transactions - {Array<Transaction>} - list should not contain duplicates
 * @return {Array<Transaction>}
 */
export function setDoubleSpendFlag(transactions) {
    try {
        transactions
            .map(tx => tx.inputs)
            .flat()
            .forEach(input => {
                const doubleSpendGroup = transactions.filter(analysingTx =>
                    analysingTx.inputs.find(
                        analysingInput =>
                            input.txid === analysingInput.txid && input.output_number === analysingInput.output_number
                    )
                );
                if (doubleSpendGroup.length > 1) {
                    doubleSpendGroup.forEach(tx => (tx.double_spend = true));
                    if (!doubleSpendGroup.find(tx => tx.confirmations > 0)) {
                        const txHavingMaxFee = doubleSpendGroup.reduce(
                            (prev, current) => (current.fee_satoshis > prev.fee_satoshis ? current : prev),
                            doubleSpendGroup[0]
                        );
                        doubleSpendGroup.forEach(tx => (tx.is_most_probable_double_spend = false));
                        txHavingMaxFee.is_most_probable_double_spend = true;
                    }
                }
            });

        return transactions;
    } catch (e) {
        improveAndRethrow(e, "setDoubleSpendFlag");
    }
}

/**
 * Analyses given transactions list and sets spendTxId for outputs.
 * NOTE: this function modifies given array!
 *
 * @param transactions - {Array<Transaction>}
 * @return {Array<Transaction>}
 */
export function setSpendTxId(transactions) {
    try {
        transactions.forEach(tx =>
            tx.outputs.forEach(output => {
                output.spend_txid = getTXIDSendingGivenOutput(output, tx.txid, transactions) ?? output.spend_txid;
            })
        );

        return transactions;
    } catch (e) {
        improveAndRethrow(e, "setSpendTxId");
    }
}
