import { getLogger } from "log4js";

import {
    addClientIpHash,
    addWalletIdAndSessionId,
    processInternalError,
    processSuccess,
    validateRequestDataAndResponseOnErrors,
} from "./controllerUtils";
import schemas from "../models/joi_schemas";
import { GET_NOTIFICATIONS_EP_NUMBER, SAVE_NOTIFICATION_EP_NUMBER } from "./endpointNumbers";
import { NotificationsService } from "../services/notificationsService";
import { getHash } from "../../../src/api/adapters/crypto-utils";
import { NOTIFICATIONS_API_TOKEN_HASH } from "../properties";

const log = getLogger("notifications");

export default class NotificationsController {
    /**
     * Retrieves notifications
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "walletId" - string
     *    - "sessionId" - string
     * 2. Query:
     *    - "clientIpHash" - string
     * It sends:
     *    HTTP Code:
     *      - 200 if notifications retrieved successfully
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 404 if no notifications found
     *      - 500 for internal errors
     *    Body:
     *      - for 200 status: { txIdHash: "txIdHash_string", description: "<description_string>" }
     *      - for 403 status::
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     *      - for other statuses: { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     */
    static async getNotifications(req, res) {
        log.debug("Start getting notifications.");
        const endpointNumber = GET_NOTIFICATIONS_EP_NUMBER;
        try {
            const data = addWalletIdAndSessionId(req, addClientIpHash(req, {}));
            const isRequestValid = await validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.getNotifications,
                endpointNumber
            );

            if (isRequestValid) {
                log.debug("Request data valid, start getting notifications.");
                const notifications = await NotificationsService.getNotifications();

                if (notifications == null || notifications.length === 0) {
                    log.debug("Notifications have not been found, sending 404.");
                    processSuccess(res, 404);
                } else {
                    log.debug("Notifications have been retrieved, sending 200.");
                    processSuccess(res, 200, notifications);
                }
            }
        } catch (e) {
            processInternalError(res, endpointNumber, "Error occurred during the notifications retrieval.", e);
        }
    }

    /**
     * Saves notification
     *
     * Request should have following params with valid values:
     * 1. Query:
     *    - "token" - string
     *    - "text" - string
     *    - "title" - string
     * It sends:
     *    HTTP Code:
     *      - 201 if notification saved successfully
     *      - 400 if there are data validation errors
     *      - 403 if token is invalid
     *      - 500 for internal errors
     *    Body:
     *      - for 201 status: { result: "success", notification: { title: string, text: string } }
     *      - for 403 status:
     *        { result: "invalid_token" }
     *      - for other statuses: { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     */
    static async saveNotification(req, res) {
        log.debug("Start saving notification.");
        const endpointNumber = SAVE_NOTIFICATION_EP_NUMBER;
        try {
            const data = req.query || {};
            const isRequestValid = await validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.saveNotification,
                endpointNumber,
                {
                    shouldNotCheckSession: true,
                    shouldNotCheckIp: true,
                    howToFixValidationError: "Pass not empty token, text and title",
                }
            );

            if (isRequestValid) {
                log.debug("Request data valid, start saving notification.");
                if (getHash(data.token) === NOTIFICATIONS_API_TOKEN_HASH) {
                    await NotificationsService.saveNotification({
                        title: data.title,
                        text: data.text,
                        timestamp: "" + Date.now(),
                    });

                    log.debug("Notification has been saved, sending 201.");
                    processSuccess(res, 201, { result: "success" });
                } else {
                    log.debug("Token is invalid, sending 403.");
                    req.body({ result: "invalid_token" }).send(403);
                }
            }
        } catch (e) {
            processInternalError(res, endpointNumber, "Error occurred while saving notification.", e);
        }
    }
}
