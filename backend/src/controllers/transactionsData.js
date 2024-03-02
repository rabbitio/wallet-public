import log4js from "log4js";

import { ControllerUtils } from "./controllerUtils.js";
import schemas from "../models/joi_schemas.js";
import { TransactionsDataService } from "../services/transactionsDataService.js";
import {
    GET_TRANSACTION_DATA_EP_NUMBER,
    SAVE_TRANSACTION_DATA_EP_NUMBER,
    UPDATE_TRANSACTION_DATA_EP_NUMBER,
} from "./endpointNumbers.js";

const log = log4js.getLogger("transactionsData");

export default class TransactionsDataController {
    /**
     * Saves transaction's data.
     * First removes transactions data with same walletId and transactionIdHash if present.
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "walletId" - string
     *    - "sessionId" - string
     * 2. Query:
     *    - "clientIpHash" - string
     * 3. Body json format:
     *    { transactionIdHash: "hash_string", encryptedNote: "note_string" }
     * It sends:
     *    HTTP Code:
     *      - 201 if transaction data saved successfully
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 500 for internal errors
     *    Body:
     *      - for non 201 status: { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     *      - for 403 status::
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     */
    static async saveTransactionData(req, res) {
        log.debug("Start saving transaction data.");
        const endpointNumber = SAVE_TRANSACTION_DATA_EP_NUMBER;
        try {
            const data = ControllerUtils.addWalletIdAndSessionId(req, ControllerUtils.addClientIpHash(req, req.body));
            const isRequestValid = await ControllerUtils.validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.saveTransactionDataScheme,
                endpointNumber
            );

            if (isRequestValid) {
                log.debug("Request data valid, start saving transaction data.");

                await TransactionsDataService.saveTransactionData(
                    data.walletId,
                    data.transactionIdHash,
                    data.encryptedNote
                );

                log.debug("Transaction data have been saved, sending 201.");
                ControllerUtils.processSuccess(res, 201);
            }
        } catch (e) {
            ControllerUtils.processInternalError(res, endpointNumber, "Error occurred during the saving of transaction data. ", e);
        }
    }

    /**
     * Retrieves transactions data.
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "walletId" - string
     *    - "sessionId" - string
     * 2. Query:
     *    - "clientIpHash" - string
     * 3. Body:
     *    - { "transactionIdHashes": Array<string> }
     * It sends:
     *    HTTP Code:
     *      - 200 if transaction data retrieved successfully
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 404 if no transaction data found
     *      - 500 for internal errors
     *    Body:
     *      - for 200 status: { txIdHash: "txIdHash_string", description: "<description_string>" }
     *      - for 403 status::
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     *      - for other statuses: { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     */
    static async getTransactionData(req, res) {
        log.debug("Start getting transactions data.");
        const endpointNumber = GET_TRANSACTION_DATA_EP_NUMBER;
        try {
            const data = ControllerUtils.addWalletIdAndSessionId(req, ControllerUtils.addClientIpHash(req, req.body));
            const isRequestValid = await ControllerUtils.validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.getTransactionsDataScheme,
                endpointNumber
            );

            if (isRequestValid) {
                log.debug("Request data valid, start getting transactions data.");
                const transactionsData = await TransactionsDataService.getTransactionsData(
                    data.walletId,
                    data.transactionIdHashes
                );

                if (transactionsData && transactionsData.length) {
                    log.debug("Transactions data have been retrieved, sending 200.");
                    ControllerUtils.processSuccess(res, 200, transactionsData);
                } else {
                    log.debug("Transaction data have not been found, sending 404.");
                    ControllerUtils.processSuccess(res, 404);
                }
            }
        } catch (e) {
            ControllerUtils.processInternalError(res, endpointNumber, "Error occurred during the retrieving of transactions data. ", e);
        }
    }

    /**
     * Updates transaction's data.
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "walletId" - string
     *    - "sessionId" - string
     * 2. Query:
     *    - "clientIpHash" - string
     * 3. Body json format:
     *    { transactionIdHash: "hash_string", encryptedNote: "note_string" }
     * It sends:
     *    HTTP Code:
     *      - 200 if transaction data saved successfully
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 404 if transaction data not found by given ids
     *      - 500 for internal errors
     *    Body:
     *      - for non 200 status: { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     *      - for 403 status::
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     */
    static async updateTransactionData(req, res) {
        log.debug("Start updating transaction data.");
        const endpointNumber = UPDATE_TRANSACTION_DATA_EP_NUMBER;
        try {
            const data = ControllerUtils.addWalletIdAndSessionId(req, ControllerUtils.addClientIpHash(req, req.body));
            const isRequestValid = await ControllerUtils.validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.updateTransactionDataScheme,
                endpointNumber
            );

            if (isRequestValid) {
                log.debug("Request data valid, start updating transaction data.");

                const updated = await TransactionsDataService.updateTransactionData(
                    data.walletId,
                    data.transactionIdHash,
                    data.encryptedNote
                );
                // TODO: [feature, critical] Process 404 case

                log.debug("Transaction data have been updated, sending 200.");
                ControllerUtils.processSuccess(res, 200, updated);
            }
        } catch (e) {
            ControllerUtils.processInternalError(res, endpointNumber, "Error occurred during the updating of transaction data. ", e);
        }
    }
}
