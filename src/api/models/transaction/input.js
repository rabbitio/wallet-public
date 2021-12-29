export class Input {
    constructor(address, value_satoshis, txid, output_number, type, sequence) {
        this.address = address;
        this.value_satoshis = value_satoshis;
        this.txid = txid;
        this.output_number = output_number;
        this.type = type;
        this.sequence = sequence;
    }

    clone() {
        return new Input(this.address, this.value_satoshis, this.txid, this.output_number, this.type, this.sequence);
    }
}
