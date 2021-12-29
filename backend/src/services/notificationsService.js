import { getLogger } from "log4js";

import { improveAndRethrow } from "../utils/utils";
import { dbConnectionHolder } from "../utils/dbConnectionHolder";
import { isInsertOneResultValid } from "./mongoUtil";

const log = getLogger("notificationsService");

export class NotificationsService {
    static documentName = "notifications";

    static async getNotifications() {
        log.debug("Start getting notifications.");
        try {
            const notificationsCollection = await dbConnectionHolder.getCollection(this.documentName);
            const notifications = await notificationsCollection.find().toArray();

            if (!notifications.length) {
                log.debug("Notifications have not been found.");
                return null;
            }

            return notifications.map(notification => ({
                title: notification.title,
                text: notification.text,
                timestamp: notification.timestamp,
            }));
        } catch (e) {
            improveAndRethrow(e, "getNotifications");
        }
    }

    static async saveNotification(notification) {
        log.debug(`Start saving notification.`);
        try {
            const notificationsCollection = await dbConnectionHolder.getCollection(this.documentName);
            const result = await notificationsCollection.insertOne(notification);

            if (!isInsertOneResultValid(result)) {
                throw new Error(`Failed to save notification ${JSON.stringify(result)}.`);
            }
            log.info("Notification were saved.");
        } catch (e) {
            improveAndRethrow(e, "saveNotification");
        }
    }
}
