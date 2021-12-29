import DedicatedNotificationsService from "./dedicatedNotificationsService";
import { improveAndRethrow } from "../../../utils/errorUtils";
import NotificationsAPI from "../../../external-apis/backend-api/notificatiionsApi";
import Notification, { NOTIFICATIONS_TYPES } from "../../../models/notification";

export default class AdminNotificationsService extends DedicatedNotificationsService {
    /**
     * Returns ony unseen admin notifications according to passed last view timestamp
     *
     * @param lastViewTimestamp
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
     * @return {Promise<Array<Notification>>}
     */
    async getWholeNotificationsList() {
        try {
            const notifications = await NotificationsAPI.getNotifications();
            return (notifications || []).map(
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
