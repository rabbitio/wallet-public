/**
 * Class to memorize data for transaction that has been checked with fake signatures.
 * Useful to build real transaction from the validated data without any checks.
 */
export class TxData {
    /**
     * @param amount {number}
     * @param address {string}
     * @param change {number}
     * @param fee {number}
     * @param changeAddress {string|null}
     * @param utxos {Array} - array of Utxo class instances
     * @param network {Object} - Network class instance
     * @param feeRate {Object} - FeeRate class instance
     */
    constructor(amount, address, change, fee, changeAddress, utxos, network, feeRate) {
        this.amount = amount;
        this.address = address;
        this.change = change;
        this.fee = fee;
        this.changeAddress = changeAddress;
        this.utxos = utxos;
        this.network = network;
        this.feeRate = feeRate;
    }

    isSendingUnconfirmedUTXOs() {
        return !!this.utxos.find(utxo => utxo.confirmations < 1);
    }
}
