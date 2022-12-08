/**
 * Class to memorize data for transaction that has been checked with fake signatures.
 * Useful to build real transaction from the validated data without any checks.
 */
export class TxData {
    /**
     * @param amount {number|string} the amount to be sent in coin atoms (satoshi, wei etc.)
     * @param address {string} target address for transaction
     * @param change {number|null} change in coin atoms
     * @param fee {number|string} fee in coin atoms
     * @param changeAddress {string|null} for coins having change address the address to send change to
     * @param utxos {Utxo[]|null} btc-specific - unspent outputs
     * @param network {Network} Network the tx is checked in
     * @param feeRate {Object} coin-specific rates object, should mandatory have "rate" attribute with coin's atoms amount
     * @throws {Error} when feeRate has wrong format
     */
    constructor(amount, address, change, fee, changeAddress, utxos, network, feeRate) {
        if (!feeRate?.rate) {
            throw new Error("Wrong fee rate format when creating TxData: " + JSON.stringify(feeRate));
        }

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
        return !!this.utxos && !!this.utxos.find(utxo => utxo.confirmations < 1);
    }

    toMiniString() {
        return `${this.amount},${this.address.slice(0, 10)},${this.change},fee:${this.fee},UTXOs:\n${
            this.utxos ? this.utxos.map(utxo => utxo.toMiniString()).join("\n") : ""
        }`;
    }
}
