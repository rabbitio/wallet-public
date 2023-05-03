export const NOTIFICATIONS_TYPES = {
    ADMIN: "admin",
    TRANSACTION_IN: "transaction_in",
    TRANSACTION_CONFIRMED: "transaction_confirmed",
    FIAT_PAYMENT_COMPLETED: "fiat_payment_completed",
    FIAT_PAYMENT_NOT_COMPLETED: "fiat_payment_not_completed",
};

export default class Notification {
    constructor(type, title, text, timestamp, data, isOnlyPush = false) {
        this.type = type;
        this.title = title;
        this.text = text;
        this.timestamp = timestamp;
        this.data = data;
        this.isOnlyPush = isOnlyPush;
    }
}
