export class Utxo {
    constructor(txid, number, value_satoshis, confirmations, type, address) {
        this.txid = txid;
        this.number = number;
        this.value_satoshis = value_satoshis;
        this.confirmations = confirmations;
        this.type = type;
        this.address = address;
    }

    toMiniString() {
        return (
            `${this.txid.slice(0, 6)},${this.number},val:${this.value_satoshis},con:${this.confirmations},` +
            `:${this.address.slice(0, 10)}`
        );
    }
}
