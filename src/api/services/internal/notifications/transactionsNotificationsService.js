import DedicatedNotificationsService from "./dedicatedNotificationsService";
import { transactionsDataProvider } from "../transactionsDataProvider";
import AddressesServiceInternal from "../addressesServiceInternal";
import { improveAndRethrow } from "../../../utils/errorUtils";
import { TransactionsDataService } from "../../transactionsDataService";
import Notification from "../../../models/notification";
import { getTransactionsHistory } from "../../../lib/transactions/transactions-history";

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
                .map(tx => Notification.createNewTransactionNotification(tx));
            const justConfirmedTransactions = this._justConfirmedTransactions.map(tx =>
                Notification.createConfirmedTransactionNotification(tx)
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
            .map(tx => Notification.createNewTransactionNotification(tx))
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
}
