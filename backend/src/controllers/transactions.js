import { getLogger } from "log4js";

import {
    addClientIpHash,
    addWalletIdAndSessionId,
    processInternalError,
    processSuccess,
    validateRequestDataAndResponseOnErrors,
} from "./controllerUtils";
import schemas from "../models/joi_schemas";
import { GET_TRANSACTIONS_EP_NUMBER, SAVE_TRANSACTIONS_EP_NUMBER } from "./endpointNumbers";
import TransactionsService from "./../services/transactionsService";

const log = getLogger("transactions");

export default class TransactionsController {
    /**
     * Saves transaction's.
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "walletId" - string
     *    - "sessionId" - string
     * 2. Query:
     *    - "clientIpHash" - string
     * 3. Body json format:
     *    { transactions: Array<Object> }
     * It sends:
     *    HTTP Code:
     *      - 201 if transactions are saved successfully
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 500 for internal errors
     *    Body:
     *      - for non 201 status: { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     *      - for 403 status::
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     */
    static async saveTransactions(req, res) {
        log.debug("Start saving transactions.");
        const endpointNumber = SAVE_TRANSACTIONS_EP_NUMBER;
        try {
            const data = addWalletIdAndSessionId(req, addClientIpHash(req, req.body));
            const isRequestValid = await validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.saveTransactions,
                endpointNumber
            );

            if (isRequestValid) {
                log.debug("Request data valid, start saving transactions.");

                await TransactionsService.saveTransactions(data.transactions);

                log.debug("Transactions have been saved, sending 201.");
                processSuccess(res, 201);
            }
        } catch (e) {
            processInternalError(res, endpointNumber, "Error occurred during the saving of transactions. ", e);
        }
    }

    /**
     * Retrieves transactions by addresses.
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "walletId" - string
     *    - "sessionId" - string
     * 2. Query:
     *    - "clientIpHash" - string
     *    - "transactionIdHashes" - string
     * 3. Body json format:
     *    { addresses: Array<Object> }
     * It sends:
     *    HTTP Code:
     *      - 200 if transactions retrieved successfully
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 404 if no transactions found
     *      - 500 for internal errors
     *    Body:
     *      - for 200 status: { transactions: Array<Object> }
     *      - for 403 status::
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     *      - for other statuses: { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     */
    static async getTransactions(req, res) {
        log.debug("Start getting transactions.");
        const endpointNumber = GET_TRANSACTIONS_EP_NUMBER;
        try {
            const data = addWalletIdAndSessionId(req, addClientIpHash(req, req.body));
            const isRequestValid = await validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.getTransactions,
                endpointNumber
            );

            if (isRequestValid) {
                log.debug("Request data valid, start getting transactions.");
                const transactionsData = await TransactionsService.getTransactions(data.addresses);

                if (transactionsData && transactionsData.length) {
                    log.debug("Transactions have been retrieved, sending 200.");
                    processSuccess(res, 200, transactionsData);
                } else {
                    log.debug("Transaction have not been found, sending 404.");
                    processSuccess(res, 404);
                }
            }
        } catch (e) {
            processInternalError(res, endpointNumber, "Error occurred during the retrieving of transactions. ", e);
        }
    }
}
