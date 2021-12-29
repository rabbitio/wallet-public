import {getLogger} from "log4js";

import {
    addClientIpHash,
    addWalletIdAndSessionId,
    processInternalError, processSuccess,
    validateRequestDataAndResponseOnErrors
} from "./controllerUtils";

import schemas from "../models/joi_schemas";
import EncryptedInvoicesService from "../services/encryptedInvoicesService";
import {
    DELETE_ENCRYPTED_INVOICES_EP_NUMBER, GET_ENCRYPTED_INVOICES_EP_NUMBER, SAVE_ENCRYPTED_INVOICE_EP_NUMBER
} from "./endpointNumbers";

const log = getLogger("encryptedInvoices");

export class EncryptedInvoicesController {
    /**
     * Saves encrypted Invoice data and its uuid for identification.
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "walletId" - string
     *    - "sessionId" - string
     * 2. Query:
     *    - "clientIpHash" - string
     * 3. Body json format:
     *    - { "invoiceUuid": string, "encryptedInvoiceData": string }
     * It sends:
     *    HTTP Code:
     *      - 201 if encrypted invoice saved successfully
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 500 for internal errors
     *    Body:
     *      - for non 201 status: { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     *      - for 403 status::
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     */
    static async saveEncryptedInvoice(req, res) {
        log.debug("Start saving encrypted invoice.");
        const endpointNumber = SAVE_ENCRYPTED_INVOICE_EP_NUMBER;

        try {
            const data = addWalletIdAndSessionId(req, addClientIpHash(req, req.body));
            const isRequestValid = await validateRequestDataAndResponseOnErrors(res, data, schemas.saveEncryptedInvoiceScheme, endpointNumber);

            if (isRequestValid) {
                log.debug("Request is valid, saving encrypted Invoice.");
                await EncryptedInvoicesService.saveEncryptedInvoice(data.walletId, data.invoiceUuid, data.encryptedInvoiceData);

                log.debug("Encrypted Invoice has been saved, sending 201.");
                processSuccess(res, 201);
            }
        } catch (e) {
            processInternalError(res, endpointNumber, "Error occurred during the saving of encrypted Invoice. ", e);
        }
    }

    /**
     * Gets encrypted Invoices by given uuids. If array of uuids is empty returns all invoices for given walletId
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "walletId" - string
     *    - "sessionId" - string
     * 2. Query:
     *    - "clientIpHash" - string
     * 3. Body json format:
     *    { "invoicesUuids": [ "uuid1", ... ] }
     * It sends:
     *    HTTP Code:
     *      - 200 if encrypted Invoices retrieved successfully
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 404 if encrypted Invoices are not found
     *      - 500 for internal errors
     *    Body:
     *      - for 200 status: { "encryptedInvoices": ["encryptedInvoiceData_string_1", ... ] },
     *      - for 404 status: { "encryptedInvoices": [] },
     *      - for 403 status::
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     *      - for other status: { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     */
    static async getEncryptedInvoices(req, res) {
        log.debug("Start getting encrypted Invoices.");
        const endpointNumber = GET_ENCRYPTED_INVOICES_EP_NUMBER;

        try {
            const data = addWalletIdAndSessionId(req, addClientIpHash(req, {}));
            req.query.invoicesUuids && (data.invoicesUuids = req.query.invoicesUuids.split(","));
            const isRequestValid = await validateRequestDataAndResponseOnErrors(res, data, schemas.getEncryptedInvoicesScheme, endpointNumber);

            if (isRequestValid) {
                log.debug("Request is valid, getting encrypted Invoices.");
                const encryptedInvoices = await EncryptedInvoicesService.getEncryptedInvoices(data.walletId, data.invoicesUuids);

                if (!encryptedInvoices || !encryptedInvoices.length) {
                    log.debug("Encrypted Invoices have not been found, sending 404.");
                    res.status(404).json([]);
                } else {
                    log.debug("Encrypted Invoices have been retrieved, sending 200 and retrieved encrypted invoices.");
                    processSuccess(res, 200, encryptedInvoices);
                }
            }
        } catch (e) {
            processInternalError(res, endpointNumber, "Error occurred during the getting of encrypted Invoices: ", e);
        }
    }

    /**
     * Removes encrypted Invoices. If array of uuids is empty removes nothing
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "walletId" - string
     *    - "sessionId" - string
     * 2. Query:
     *    - "clientIpHash" - string
     * 3. Body json format:
     *    - { "invoicesUuids": [ "<ipHash_string>", .. ] }
     * It sends:
     *    HTTP Code:
     *      - 204 if encrypted Invoices are successfully removed
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 500 for internal errors
     *    Body:
     *      - for 403 status::
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     *      - for non 204 statuses: { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }

     */
    static async deleteEncryptedInvoices(req, res) {
        log.debug("Start deleting encrypted Invoices.");
        const endpointNumber = DELETE_ENCRYPTED_INVOICES_EP_NUMBER;

        try {
            const data = addWalletIdAndSessionId(req, addClientIpHash(req, req.body));
            const isRequestValid = await validateRequestDataAndResponseOnErrors(res, data, schemas.deleteEncryptedInvoiceScheme, endpointNumber);

            if (isRequestValid) {
                log.debug("Request is valid, start deletion of encrypted Invoices.");
                /**
                 * NOTE: if there is no invoice with one of given uuids than we still return success as the result is
                 * still being achieved - there is no such document in DB
                 */
                await EncryptedInvoicesService.deleteSpecificEncryptedInvoices(data.walletId, data.invoicesUuids);
                log.debug("Given encrypted Invoices have been deleted, sending 204.");
                processSuccess(res, 204);
            }
        } catch (e) {
            processInternalError(res, endpointNumber, "Error occurred during the deletion of encrypted Invoices. ", e);
        }
    }
}
