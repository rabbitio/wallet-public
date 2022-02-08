import { getLogger } from "log4js";

import {
    addClientIpHash,
    addWalletIdAndSessionId,
    processInternalError,
    processSuccess,
    validateRequestDataAndResponseOnErrors,
} from "./controllerUtils";

import schemas from "../models/joi_schemas";
import {
    GET_PAYMENTS_NOTIFICATIONS_EP_NUMBER,
    GET_TRANSACTIONS_TO_PAYMENTS_MAPPING_EP_NUMBER,
} from "./endpointNumbers";
import TransactionsToPaymentsService from "../services/transactionsToPaymentsService";

const log = getLogger("fiatPaymentsController");

export class FiatPaymentsController {
    /**
     * Retrieves transactions to payments mapping.
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "walletId" - string
     *    - "sessionId" - string
     * 2. Query:
     *    - "clientIpHash" - string
     * 3. Body json format:
     *    { paymentIds: Array<string> }
     * It sends:
     *    HTTP Code:
     *      - 200 if mapping retrieved successfully
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 404 if mapping is empty
     *      - 500 for internal errors
     *    Body:
     *      - for 200 status: [ { txid: "y...y", paymentId: "x...x", fiatAmount: number, fiatCurrencyCode: string }, ... ]
     *      - for 404 status: <empty>
     *      - for 403 status::
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     *      - for other statuses: { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     */
    static async getTransactionsToPaymentsMapping(req, res) {
        log.debug("Start getting transactions to payments mapping.");
        const endpointNumber = GET_TRANSACTIONS_TO_PAYMENTS_MAPPING_EP_NUMBER;
        try {
            const data = addWalletIdAndSessionId(req, addClientIpHash(req, req.body));
            const isRequestValid = await validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.getTransactionsToPaymentsMapping,
                endpointNumber
            );

            if (isRequestValid) {
                log.debug("Request data valid, start getting transactions to payments mapping.");
                const transactionsData = await TransactionsToPaymentsService.getTransactionsToPaymentsMapping(
                    data.paymentIds
                );

                if (transactionsData && transactionsData.length) {
                    log.debug("Mapping retrieved, sending 200.");
                    processSuccess(res, 200, transactionsData);
                } else {
                    log.debug("Mapping is empty, sending 404.");
                    processSuccess(res, 404);
                }
            }
        } catch (e) {
            processInternalError(
                res,
                endpointNumber,
                "Error occurred during the retrieving the transactions to payments mapping. ",
                e
            );
        }
    }

    /**
     * Retrieves notifications about payments.
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "walletId" - string
     *    - "sessionId" - string
     * 2. Query:
     *    - "clientIpHash" - string
     * 3. Body json format:
     *    { paymentIds: Array<string> }
     * It sends:
     *    HTTP Code:
     *      - 200 if notifications retrieved successfully
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 404 if there is no notifications for given transaction ids
     *      - 500 for internal errors
     *    Body:
     *      - for 200 status: [ { paymentId: "id_string", notifications: [{ "type": <SUCCESS|ERROR>, "timestamp": timestamp } }, ... ]
     *      - for 404 status: <empty>
     *      - for 403 status::
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     *      - for other statuses: { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     */
    static async getPaymentsNotifications(req, res) {
        log.debug("Start getting notifications about the payments for given transaction ids.");
        const endpointNumber = GET_PAYMENTS_NOTIFICATIONS_EP_NUMBER;
        try {
            const data = addWalletIdAndSessionId(req, addClientIpHash(req, req.body));
            const isRequestValid = await validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.getPaymentNotifications,
                endpointNumber
            );

            if (isRequestValid) {
                log.debug("Request data valid, start getting notifications.");

                const notificationsData = await TransactionsToPaymentsService.getPaymentsNotifications(data.paymentIds);

                if (notificationsData && notificationsData.length) {
                    log.debug("Notifications retrieved, sending 200.");
                    processSuccess(res, 200, notificationsData);
                } else {
                    log.debug("Notification not found, sending 404.");
                    processSuccess(res, 404);
                }
            }
        } catch (e) {
            processInternalError(
                res,
                endpointNumber,
                "Error occurred during the retrieving notifications for payments. ",
                e
            );
        }
    }
}
