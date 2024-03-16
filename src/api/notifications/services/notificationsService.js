import { improveAndRethrow, Logger } from "@rabbitio/ui-kit";

// import TransactionsNotificationsService from "./internal/notifications/transactionsNotificationsService.js";
import AdminNotificationsService from "./internal/notifications/adminNotificationsService.js";
import { Storage } from "../../common/services/internal/storage.js";
import Notification from "../models/notification.js";
// import FiatPaymentsNotificationsService from "./internal/notifications/fiatPaymentsNotificationsService.js";
import { PreferencesService } from "../../wallet/common/services/preferencesService.js";
import { UserDataAndSettings } from "../../wallet/common/models/userDataAndSettings.js";

class NotificationsService {
    constructor() {
        this._dedicatedServices = [
            // new TransactionsNotificationsService(), TODO: [feature, low] task_id=014bd7ea795c49b0b5f38caadabc60df
            new AdminNotificationsService(),
            // new FiatPaymentsNotificationsService(), TODO: [feature, moderate] enable or remove when integrating new on ramp service task_id=16127916f375490aa6b526675a6c72e4
        ];
    }

    /**
     * Returns count of unseen notifications and composes pushes to be shown about unseen notifications and marks
     * corresponding notifications as ones for which pushes were shown.
     * Note that notifications that have isOnlyPush === true are not counted in the unseen counter and shown pushes counter.
     *
     * @return {Promise<{unseenNotificationsCount: number, notificationsNotYetShownAsPushes: Array}>}
     */
    async getNotificationsCountAndViewPushes(forceFetchData = false) {
        try {
            const walletId = Storage.getWalletId();
            const notifications = await this._getUnseenNotificationsList(false, forceFetchData);
            const shownPushesCount = +(Storage.getShownNotificationPushesCount(walletId) || 0);

            const unseenCount = notifications.filter(notification => !notification.isOnlyPush).length;
            const notYetShownPushesCount = notifications.length - shownPushesCount;
            let notificationsNotYetShownAsPushes = [];
            Storage.saveShownNotificationPushesCount(notifications.length, walletId);
            if (notYetShownPushesCount > 0) {
                notificationsNotYetShownAsPushes = notifications.slice(0, notYetShownPushesCount);
            }

            return {
                unseenNotificationsCount: unseenCount,
                notificationsNotYetShownAsPushes: notificationsNotYetShownAsPushes,
            };
        } catch (e) {
            improveAndRethrow(e, "getNotificationsCountAndViewPushes");
        }
    }

    /**
     * Returns a list of unseen Notifications sorted by timestamp desc.
     * Updates last view timestamp and sets count of unseen notifications to show push for to 0.
     *
     * @return {Promise<Array<Notification>>}
     */
    async viewAllUnseenNotifications() {
        const allUnseen = await this._getUnseenNotificationsList(true);
        return allUnseen.filter(notification => !notification.isOnlyPush);
    }

    async _getUnseenNotificationsList(isSetLastNotificationsViewTimestamp = false, forceFetchData = false) {
        try {
            const lastNotificationsViewTimestamp = PreferencesService.getUserSettingValue(
                UserDataAndSettings.SETTINGS.LAST_NOTIFICATIONS_VIEW_TIMESTAMP
            );
            const notificationsPromises = this._dedicatedServices.map(service =>
                service.getUnseenNotificationsList(+lastNotificationsViewTimestamp || 0, forceFetchData).catch(e => {
                    Logger.logError(e, "_getUnseenNotificationsList", "One of notifications services failed");
                    return [];
                })
            );
            const notifications = (await Promise.all(notificationsPromises))
                .flat()
                .filter(notification => notification instanceof Notification);
            notifications.sort((n1, n2) => n2.timestamp - n1.timestamp);

            if (isSetLastNotificationsViewTimestamp) {
                await PreferencesService.cacheAndSaveSetting(
                    UserDataAndSettings.SETTINGS.LAST_NOTIFICATIONS_VIEW_TIMESTAMP,
                    "" + Date.now()
                );
                Storage.saveShownNotificationPushesCount(0, Storage.getWalletId());
            }

            return notifications;
        } catch (e) {
            improveAndRethrow(e, "_getUnseenNotificationsList");
        }
    }

    /**
     * Returns all notifications sorted desc by timestamp
     *
     * @return {Promise<Array<Notification>>}
     */
    async getWholeListOfNotifications() {
        const loggerSource = "getWholeListOfNotifications";
        try {
            Logger.log("Start getting the whole list of notifications", loggerSource);
            const creationTime = PreferencesService.getWalletCreationTime();
            const promises = this._dedicatedServices.map(service =>
                service
                    .getWholeNotificationsList(creationTime)
                    .catch(e =>
                        Logger.logError(
                            e,
                            "getWholeListOfNotifications",
                            "Failed to retrieve whole notifications list from some service"
                        )
                    )
            );
            const notifications = (await Promise.all(promises))
                .flat()
                .filter(notification => notification instanceof Notification);
            notifications.sort((n1, n2) => n2.timestamp - n1.timestamp);

            Logger.log(`Got the whole list of notifications ${notifications.length}`, loggerSource);
            return notifications.filter(notification => !notification.isOnlyPush);
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }
}

const notificationsService = new NotificationsService();
export default notificationsService;
