export class Utxo {
    constructor(txid, number, value_satoshis, confirmations, type, address) {
        this.txid = txid;
        this.number = number;
        this.value_satoshis = value_satoshis;
        this.confirmations = confirmations;
        this.type = type;
        this.address = address;
    }
}
