import { Coins } from "../../coins";

/**
 * Model representing the transaction as history item of a wallet
 */
export class TransactionsHistoryItem {
    /**
     * @param txid {string} id string of this transaction
     * @param ticker {string} ticker (id) of coin the transaction belongs to
     * @param tickerPrintable {string} ticker of coin the transaction belongs to in printable format
     * @param type {"in"|"out"} type of transaction - incoming or outgoing in terms of current wallet
     * @param amount {string} number or string of coin's atoms (satoshi, wei etc.) sent in this transaction
     * @param confirmations {number} number of blocks after the block including this transaction counting with this block
     * @param time {number} timestamp of ether creation of the unconfirmed transaction or block mining timestamp
     * @param address {string} for incoming transaction the address is it is received on. For outgoing - the target
     *        address. Address is stored in lowercase
     * @param fees {string} string of coin's atoms (satoshi, wei etc.) paid as a fee for this confirmed transaction.
     *        When transaction is not confirmed this field may contain approximate fee for some coins
     * @param full_tx {Object} object containing raw details for this transaction. it is coin-dependent and can be
     *        used only on the low level knowing the raw transaction structure. Most likely this is coin-library
     *        dependent transaction object
     * @param isRbfAble {boolean} whether this transaction can be speed up. Can be always false for some coins aren't
     *        supporting this feature
     * @param isSendingAndReceiving {boolean} whether this transaction sends to the same wallet it sends from
     * @param double_spend {boolean} whether this transaction double spending. Can be always false for some coins
     *        if the feature is not supported
     * @param is_most_probable_double_spend {boolean} whether this transaction is double spending not definitely but
     *        with a high probability. Can be always false for some coins if the feature is not supported
     */
    constructor(
        txid,
        ticker,
        tickerPrintable,
        type,
        amount,
        confirmations,
        time,
        address,
        fees,
        full_tx,
        isRbfAble = false,
        isSendingAndReceiving = false,
        double_spend = false,
        is_most_probable_double_spend = false
    ) {
        this.txid = txid;
        this.ticker = ticker;
        this.tickerPrintable = tickerPrintable;
        this.type = type;
        this.amount = amount;
        this.confirmations = confirmations;
        this.time = time;
        this.address = Coins.getCoinByTicker(ticker).doesUseLowerCaseAddresses
            ? (address ?? "").toLowerCase()
            : address ?? "";
        this.fees = fees;
        this.isRbfAble = isRbfAble;
        this.full_tx = full_tx;
        this.isSendingAndReceiving = isSendingAndReceiving;
        this.double_spend = double_spend;
        this.is_most_probable_double_spend = is_most_probable_double_spend;
    }
}
