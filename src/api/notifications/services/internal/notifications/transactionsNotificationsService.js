import DedicatedNotificationsService from "./dedicatedNotificationsService";
import { improveAndRethrow } from "../../../../common/utils/errorUtils";
import Notification, { NOTIFICATIONS_TYPES } from "../../../models/notification";
import { TransactionDetailsService } from "../../../../wallet/common/services/transactionDetailsService";
import TransactionsHistoryService from "../../../../wallet/common/services/transactionsHistoryService";
import { Coins } from "../../../../wallet/coins";

export default class TransactionsNotificationsService extends DedicatedNotificationsService {
    constructor() {
        super();
        this._allTransactions = [];
        this._justConfirmedTransactions = [];
        this._confirmingTransactions = [];
    }

    async getUnseenNotificationsList(lastViewTimestamp, forceFetchData = false) {
        try {
            await this._actualizeTransactionsData(forceFetchData);
            const newTransactionsNotifications = this._allTransactions
                .filter(tx => tx.creationTime > lastViewTimestamp && tx.type === "incoming")
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
     * @param walletCreationTime {number} - wallet creation timestamp
     *
     * @return {Promise<Array<Notification>>}
     */
    async getWholeNotificationsList(walletCreationTime) {
        return this._allTransactions
            .map(tx => TransactionsNotificationsService._createNewTransactionNotification(tx))
            .sort((t1, t2) => t2.timestamp - t1.timestamp);
    }

    async _actualizeTransactionsData(forceFetchData = false) {
        try {
            const params = [Coins.getEnabledCoinsTickers(), Number.MAX_SAFE_INTEGER];
            if (forceFetchData) {
                TransactionsHistoryService.invalidateCaches(...params);
            }
            this._allTransactions = (await TransactionsHistoryService.getTransactionsList(...params))?.transactions;
            this._justConfirmedTransactions = this._allTransactions
                .filter(
                    confirmedTx =>
                        confirmedTx.confirmations >= TransactionDetailsService.minConfirmations(confirmedTx.ticker) &&
                        this._confirmingTransactions.find(unconfirmedTx => unconfirmedTx.txid === confirmedTx.txid)
                )
                .map(tx => ({ ...tx, approximateConfirmationTimestamp: Date.now() }));
            this._confirmingTransactions = this._allTransactions.filter(
                tx => tx.confirmations < TransactionDetailsService.minConfirmations(tx.ticker)
            );
        } catch (e) {
            improveAndRethrow(e, "_actualizeTransactionsData");
        }
    }

    static _createNewTransactionNotification(tx) {
        return new Notification(
            tx.type === "incoming" ? NOTIFICATIONS_TYPES.TRANSACTION_IN : NOTIFICATIONS_TYPES.TRANSACTION_OUT,
            tx.type === "incoming"
                ? `New incoming ${tx.tickerPrintable} transaction`
                : `New outgoing ${tx.tickerPrintable} transaction`,
            `You've ` +
                (tx.type === "incoming" ? "got " : "sent ") +
                `${tx.amountSignificantString} ` +
                tx.tickerPrintable +
                (tx.status !== "confirmed" ? ". The transaction is now pending confirmation.." : ""),
            tx.creationTime,
            { txid: tx.txid, ticker: tx.ticker }
        );
    }

    static _createConfirmedTransactionNotification(tx) {
        return new Notification(
            NOTIFICATIONS_TYPES.TRANSACTION_CONFIRMED,
            "Transaction confirmed",
            (tx.type === "incoming" ? "Incoming" : "Outgoing") +
                " transaction of " +
                tx.amountSignificantString +
                " " +
                tx.tickerPrintable +
                " is confirmed.",
            // `#${tx.txid.slice(0, 10)} ${tx.type === "incoming" ? "sending" : "receiving"} ${
            //     tx.amountSignificantString
            // } ${tx.tickerPrintable}`,
            /**
             * This is a small hack as confirmation time is not the creation time, and we can avoid calling for
             * confirmation timestamp just by slightly increasing the creation timestamp. It will help when we sort
             * the notifications and confirmation pushes will be shown.
             */
            tx.creationTime + 1,
            { txid: tx.txid, ticker: tx.ticker },
            true
        );
    }
}
