import DedicatedNotificationsService from "./dedicatedNotificationsService";
import { transactionsDataProvider } from "../transactionsDataProvider";
import AddressesServiceInternal from "../addressesServiceInternal";
import { improveAndRethrow } from "../../../utils/errorUtils";
import { TransactionsDataService } from "../../transactionsDataService";
import Notification, { NOTIFICATIONS_TYPES } from "../../../models/notification";
import { getTransactionsHistory } from "../../../lib/transactions/transactions-history";
import { satoshiToBtc } from "../../../lib/btc-utils";

export default class TransactionsNotificationsService extends DedicatedNotificationsService {
    constructor() {
        super();
        this._allTransactions = [];
        this._justConfirmedTransactions = [];
        this._confirmingTransactions = [];
    }

    async getUnseenNotificationsList(lastViewTimestamp) {
        try {
            await this._actualizeTransactionsData();
            const newTransactionsNotifications = this._allTransactions
                .filter(tx => tx.time > lastViewTimestamp)
                .map(tx => TransactionsNotificationsService._createNewTransactionNotification(tx));
            const justConfirmedTransactions = this._justConfirmedTransactions.map(tx =>
                TransactionsNotificationsService._createConfirmedTransactionNotification(tx)
            );
            const allTransactionsForNotifications = [...newTransactionsNotifications, ...justConfirmedTransactions];
            allTransactionsForNotifications.sort((t1, t2) => t2.timestamp - t1.timestamp);

            return allTransactionsForNotifications;
        } catch (e) {
            improveAndRethrow(e, "getUnseenNotificationsList", "Failed to get unseen notifications about transactions");
        }
    }

    /**
     * Returns all "new transaction" notifications
     *
     * @return {Promise<Array<Notification>>}
     */
    async getWholeNotificationsList() {
        return this._allTransactions
            .map(tx => TransactionsNotificationsService._createNewTransactionNotification(tx))
            .sort((t1, t2) => t2.timestamp - t1.timestamp);
    }

    async _actualizeTransactionsData() {
        try {
            const allAddresses = await AddressesServiceInternal.getAllUsedAddresses();
            const txs = await transactionsDataProvider.getTransactionsByAddresses([
                ...allAddresses.internal,
                ...allAddresses.external,
            ]);
            this._allTransactions = getTransactionsHistory(allAddresses, txs, []);
            this._justConfirmedTransactions = this._allTransactions
                .filter(
                    confirmedTx =>
                        confirmedTx.confirmations >= TransactionsDataService.MIN_CONFIRMATIONS &&
                        this._confirmingTransactions.find(unconfirmedTx => unconfirmedTx.txid === confirmedTx.txid)
                )
                .map(tx => ({ ...tx, approximateConfirmationTimestamp: Date.now() }));
            this._confirmingTransactions = this._allTransactions.filter(
                tx => tx.confirmations < TransactionsDataService.MIN_CONFIRMATIONS
            );
        } catch (e) {
            improveAndRethrow(e, "_actualizeNotificationsLists");
        }
    }

    static _createNewTransactionNotification(tx) {
        return new Notification(
            tx.type === "in" ? NOTIFICATIONS_TYPES.TRANSACTION_IN : NOTIFICATIONS_TYPES.TRANSACTION_OUT,
            tx.type === "in" ? "New Incoming Transaction" : "New Outgoing Transaction",
            `You've ` + (tx.type === "in" ? "got " : "sent ") + `${satoshiToBtc(tx.amount)} BTC`,
            tx.time,
            { txid: tx.txid }
        );
    }

    static _createConfirmedTransactionNotification(tx) {
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
