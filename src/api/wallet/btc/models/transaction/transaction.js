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
}
