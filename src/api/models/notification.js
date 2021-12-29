import { satoshiToBtc } from "../lib/btc-utils";

export const NOTIFICATIONS_TYPES = {
    ADMIN: "admin",
    TRANSACTION_IN: "transaction_in",
    TRANSACTION_OUT: "transaction_out",
    TRANSACTION_CONFIRMED: "transaction_confirmed",
};

class Notification {
    constructor(type, title, text, timestamp, data, isOnlyPush = false) {
        this.type = type;
        this.title = title;
        this.text = text;
        this.timestamp = timestamp;
        this.data = data;
        this.isOnlyPush = isOnlyPush;
    }

    static createNewTransactionNotification(tx) {
        return new Notification(
            tx.type === "in" ? NOTIFICATIONS_TYPES.TRANSACTION_IN : NOTIFICATIONS_TYPES.TRANSACTION_OUT,
            tx.type === "in" ? "New Incoming Transaction" : "New Outgoing Transaction",
            `You've ` + (tx.type === "in" ? "got " : "sent ") + `${satoshiToBtc(tx.amount)} BTC`,
            tx.time,
            { txid: tx.txid }
        );
    }

    static createConfirmedTransactionNotification(tx) {
        return new Notification(
            NOTIFICATIONS_TYPES.TRANSACTION_CONFIRMED,
            "Transaction Confirmed",
            `#${tx.txid.slice(0, 10)} ${tx.type === "in" ? "sending" : "receiving"} ${satoshiToBtc(tx.amount)} BTC`,
            tx.approximateConfirmationTimestamp,
            { txid: tx.txid },
            true
        );
    }
}

export default Notification;
