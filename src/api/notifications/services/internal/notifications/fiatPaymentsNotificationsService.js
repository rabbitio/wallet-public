import { improveAndRethrow } from "@rabbitio/ui-kit";

import { EncryptedWalletPaymentIdsService } from "../../../../purchases/services/encryptedWalletPaymentIdsService.js";
import Notification, { NOTIFICATIONS_TYPES } from "../../../models/notification.js";
import FiatPaymentsService from "../../../../purchases/services/FiatPaymentsService.js";

// TODO: [feature, moderate] use it if binance connect support this feature task_id=16127916f375490aa6b526675a6c72e4
export default class FiatPaymentsNotificationsService {
    /**
     * Returns unseen fiat payments notifications according to given last view timestamp
     *
     * @param lastViewTimestamp {number} - timestamp when notifications were last seen
     * @return {Promise<Array<Notification>>}
     */
    async getUnseenNotificationsList(lastViewTimestamp) {
        try {
            const allNotifications = await this._getAllNotifications();

            return allNotifications.filter(item => item.timestamp > lastViewTimestamp);
        } catch (e) {
            improveAndRethrow(e, "getUnseenNotificationsList");
        }
    }

    /**
     * Returns all fiat payments notifications
     * @param walletCreationTime {number} - wallet creation timestamp
     *
     * @return {Promise<Array<Notification>>}
     */
    async getWholeNotificationsList(walletCreationTime) {
        return this._getAllNotifications();
    }

    async _getAllNotifications() {
        try {
            const paymentIds = await EncryptedWalletPaymentIdsService.getPaymentIdsForCurrentWallet();
            const notifications = await FiatPaymentsService.getPaymentsNotifications(paymentIds);
            return notifications
                .map(item =>
                    item.notifications.map(exactPaymentNotification => ({
                        ...exactPaymentNotification,
                        paymentId: item.paymentId,
                    }))
                )
                .flat()
                .map(FiatPaymentsNotificationsService._createFiatPaymentNotification);
        } catch (e) {
            improveAndRethrow(e, "_getAllNotifications");
        }
    }

    static _createFiatPaymentNotification(notificationData) {
        if (notificationData.type === "SUCCESS") {
            return new Notification(
                NOTIFICATIONS_TYPES.FIAT_PAYMENT_COMPLETED,
                "Coin purchase complete",
                `Your coin purchase ${notificationData.paymentId} has been completed successfully. For details check you email address entered in the form.`,
                notificationData.timestamp,
                { paymentId: notificationData.paymentId }
            );
        }

        return new Notification(
            NOTIFICATIONS_TYPES.FIAT_PAYMENT_NOT_COMPLETED,
            "Coin purchase failed",
            `Your coin purchase ${notificationData.paymentId} has failed. For details check you email address entered in the form.`,
            notificationData.timestamp,
            { paymentId: notificationData.paymentId }
        );
    }
}
