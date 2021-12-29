export class Output {
    constructor(addresses, value_satoshis, type, spend_txid, number) {
        this.addresses = addresses;
        this.value_satoshis = value_satoshis;
        this.type = type;
        this.spend_txid = spend_txid;
        this.number = number;
    }

    clone() {
        return new Output([...this.addresses], this.value_satoshis, this.type, this.spend_txid, this.number);
    }
}
