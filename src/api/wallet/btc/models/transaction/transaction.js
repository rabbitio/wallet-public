import { improveAndRethrow } from "@rabbitio/ui-kit";

import { Input } from "./input.js";
import { Output } from "./output.js";
import { Utxos, getOutputTypeByAddress } from "../../lib/utxos.js";
import { MAX_RBF_SEQUENCE } from "../../lib/transactions/build-transaction.js";

export class Transaction {
    constructor(
        txid,
        confirmations,
        block_height,
        timestampSeconds,
        fee_satoshis,
        double_spend,
        inputs,
        outputs,
        is_most_probable_double_spend = null
    ) {
        this.txid = txid;
        this.confirmations = confirmations;
        this.block_height = block_height;
        this.time = timestampSeconds * 1000; // TODO: [refactoring, moderate] Remove this workaround - prepare data at usages
        this.fee_satoshis = fee_satoshis;
        this.double_spend = double_spend;
        this.inputs = inputs;
        this.outputs = outputs;
        this.is_most_probable_double_spend = is_most_probable_double_spend;
    }

    clone() {
        return new Transaction(
            this.txid,
            this.confirmations,
            this.block_height,
            Math.round(this.time / 1000),
            this.fee_satoshis,
            this.double_spend,
            this.inputs.map(input => input.clone()),
            this.outputs.map(output => output.clone()),
            this.is_most_probable_double_spend
        );
    }

    /**
     * Composes transaction on base of tx data
     *
     * @param txData {TxData} TxData object from sending process
     * @param txId {string} hash string
     * @param [confirmations=0] {number}
     * @param [blockHeight=0] {number}
     */
    static fromTxData(txData, txId, confirmations = 0, blockHeight = 0) {
        try {
            const inputs = txData.utxos.map(
                utxo =>
                    new Input(utxo.address, utxo.value_satoshis, utxo.txid, utxo.number, utxo.type, MAX_RBF_SEQUENCE)
            );
            const to = txData.address;
            const outputs = [new Output([to], txData.amount, getOutputTypeByAddress(to), null, 0)];
            const change = txData.utxos.reduce((p, c) => p + c.value_satoshis, 0) - txData.amount - txData.fee;
            if (change > Utxos.getDustThreshold(to)) {
                outputs.push(
                    new Output([txData.changeAddress], change, getOutputTypeByAddress(txData.changeAddress), null, 1)
                );
            }
            return new Transaction(
                txId,
                confirmations,
                blockHeight,
                Math.floor(Date.now() / 1000),
                txData.fee,
                false,
                inputs,
                outputs
            );
        } catch (e) {
            improveAndRethrow(e, "fromTxData");
        }
    }
}
