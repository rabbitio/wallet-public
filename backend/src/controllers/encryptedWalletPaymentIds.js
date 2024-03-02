import log4js from "log4js";

import { ControllerUtils } from "./controllerUtils.js";

import schemas from "../models/joi_schemas.js";
import {
    GET_LIST_OF_ENCRYPTED_WALLET_PAYMENT_IDS_EP_NUMBER,
    SAVE_ENCRYPTED_WALLET_PAYMENT_ID_EP_NUMBER,
} from "./endpointNumbers.js";
import { EncryptedWalletPaymentIdsService } from "../services/encryptedWalletPaymentIdsService.js";

const log = log4js.getLogger("encryptedWalletPaymentIds");

export class EncryptedWalletPaymentIdsController {
    /**
     * Saves encrypted payment id.
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "walletId" - string
     *    - "sessionId" - string
     * 2. Query:
     *    - "clientIpHash" - string
     * 3. Body json format:
     *    - { "encryptedPaymentId": "<encrypted_id_string>" }
     * It sends:
     *    HTTP Code:
     *      - 201 if encrypted payment id saved successfully
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 500 for internal errors
     *    Body:
     *      - for non 201 status: { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     *      - for 403 status::
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     */
    static async saveEncryptedWalletPaymentId(req, res) {
        log.debug("Start saving encrypted payment id.");
        const endpointNumber = SAVE_ENCRYPTED_WALLET_PAYMENT_ID_EP_NUMBER;

        try {
            const data = ControllerUtils.addWalletIdAndSessionId(req, ControllerUtils.addClientIpHash(req, req.body));
            const isRequestValid = await ControllerUtils.validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.saveEncryptedWalletPaymentId,
                endpointNumber
            );

            if (isRequestValid) {
                log.debug("Request is valid, saving encrypted payment id.");
                await EncryptedWalletPaymentIdsService.saveEncryptedWalletPaymentId(
                    data.walletId,
                    data.encryptedPaymentId
                );

                log.debug("Encrypted payment id was saved, sending 201.");
                ControllerUtils.processSuccess(res, 201);
            }
        } catch (e) {
            ControllerUtils.processInternalError(res, endpointNumber, "Error occurred during the saving of encrypted payment id. ", e);
        }
    }

    /**
     * Gets encrypted payment ids for wallet id.
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "walletId" - string
     *    - "sessionId" - string
     * 2. Query:
     *    - "clientIpHash" - string
     *
     * It sends:
     *    HTTP Code:
     *      - 200 if encrypted payment ids list retrieved successfully
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 404 if encrypted payment ids were not found
     *      - 500 for internal errors
     *    Body:
     *      - for 200 status: { "encryptedPaymentIds": ["<encrypted_id_string>", ... ] },
     *      - for 404 status: { "encryptedPaymentIds": [] },
     *      - for 403 status::
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     *      - for other status: { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     */
    static async getEncryptedWalletPaymentIds(req, res) {
        log.debug("Start getting encrypted payment ids.");
        const endpointNumber = GET_LIST_OF_ENCRYPTED_WALLET_PAYMENT_IDS_EP_NUMBER;

        try {
            const data = ControllerUtils.addWalletIdAndSessionId(req, ControllerUtils.addClientIpHash(req, {}));
            const isRequestValid = await ControllerUtils.validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.getListOfEncryptedWalletPaymentIds,
                endpointNumber
            );

            if (isRequestValid) {
                log.debug("Request is valid, getting encrypted payment ids.");
                const encryptedPaymentIds = await EncryptedWalletPaymentIdsService.getListOfEncryptedWalletPaymentIds(
                    data.walletId
                );

                if (!encryptedPaymentIds || !encryptedPaymentIds.length) {
                    log.debug("Encrypted payment ids were not found, sending 404.");
                    res.status(404).json({ encryptedPaymentIds: [] });
                } else {
                    log.debug("Encrypted payment ids were retrieved, sending 200 and the ids.");
                    ControllerUtils.processSuccess(res, 200, { encryptedPaymentIds });
                }
            }
        } catch (e) {
            ControllerUtils.processInternalError(
                res,
                endpointNumber,
                "Error occurred during the getting of encrypted payment ids: ",
                e
            );
        }
    }
}
