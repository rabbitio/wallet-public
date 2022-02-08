import { improveAndRethrow } from "../../../utils/errorUtils";
import { EncryptedWalletPaymentIdsService } from "../encryptedWalletPaymentIdsService";
import Notification, { NOTIFICATIONS_TYPES } from "../../../models/notification";
import FiatPaymentsService from "../FiatPaymentsService";

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
     * @return {Promise<Array<Notification>>}
     */
    async getWholeNotificationsList() {
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
                "Bitcoin purchase complete",
                `Your Bitcoin purchase ${notificationData.paymentId} has been completed successfully. For details check you email address entered in the form.`,
                notificationData.timestamp,
                { paymentId: notificationData.paymentId }
            );
        }

        return new Notification(
            NOTIFICATIONS_TYPES.FIAT_PAYMENT_NOT_COMPLETED,
            "Bitcoin purchase failed",
            `Your Bitcoin purchase ${notificationData.paymentId} has failed. For details check you email address entered in the form.`,
            notificationData.timestamp,
            { paymentId: notificationData.paymentId }
        );
    }
}
