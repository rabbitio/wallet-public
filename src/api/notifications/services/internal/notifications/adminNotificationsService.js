import { improveAndRethrow } from "@rabbitio/ui-kit";

import DedicatedNotificationsService from "./dedicatedNotificationsService.js";
import NotificationsAPI from "../../../backend-api/notificatiionsApi.js";
import Notification, { NOTIFICATIONS_TYPES } from "../../../models/notification.js";

export default class AdminNotificationsService extends DedicatedNotificationsService {
    /**
     * Returns ony unseen admin notifications according to passed last view timestamp
     *
     * @param lastViewTimestamp {number} - timestamp when notifications were last seen
     * @return {Promise<Array<Notification>>}
     */
    async getUnseenNotificationsList(lastViewTimestamp) {
        try {
            const notifications = await NotificationsAPI.getNotifications();
            return (notifications || [])
                .filter(notification => +notification.timestamp > +lastViewTimestamp)
                .map(
                    notification =>
                        new Notification(
                            NOTIFICATIONS_TYPES.ADMIN,
                            notification.title,
                            notification.text,
                            notification.timestamp,
                            {}
                        )
                );
        } catch (e) {
            improveAndRethrow(e, "getUnseenNotificationsList", "Failed to get unseen admin notifications");
        }
    }

    /**
     * Returns all admin notifications
     *
     * @param walletCreationTime {number} - wallet creation timestamp
     * @return {Promise<Array<Notification>>}
     */
    async getWholeNotificationsList(walletCreationTime) {
        try {
            const notifications = await NotificationsAPI.getNotifications();
            return (notifications || [])
                .filter(notification => +notification.timestamp > +walletCreationTime)
                .map(
                    notification =>
                        new Notification(
                            NOTIFICATIONS_TYPES.ADMIN,
                            notification.title,
                            notification.text,
                            notification.timestamp,
                            {}
                        )
                );
        } catch (e) {
            improveAndRethrow(e, "getWholeNotificationsList", "Failed to get whole list of admin notifications");
        }
    }
}
