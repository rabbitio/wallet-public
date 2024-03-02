import log4js from "log4js";

import { ControllerUtils } from "./controllerUtils.js";

import schemas from "../models/joi_schemas.js";
import EncryptedIpsService from "../services/encryptedIpsService.js";
import {
    DELETE_ENCRYPTED_IPS_EP_NUMBER,
    GET_ENCRYPTED_IPS_EP_NUMBER,
    IS_IP_HASH_PRESENT_EP_NUMBER,
    SAVE_ENCRYPTED_IP_EP_NUMBER,
} from "./endpointNumbers.js";

const log = log4js.getLogger("encryptedIps");

export class EncryptedIpsController {
    /**
     * Saves encrypted ip.
     *
     * Also saves hash (of pure IP address string). It allows us to check equality of client addresses and stored ones (We
     * cannot compare encrypted IPs because used AES encryption is not idempotent - returns different result for the same
     * input).
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "walletId" - string
     *    - "sessionId" - string
     * 2. Query:
     *    - "clientIpHash" - string
     * 3. Body json format:
     *    - { "encryptedIp": "<encrypted_ip_string>", ipHash: "<ipHash_string>" }
     * It sends:
     *    HTTP Code:
     *      - 201 if encrypted ip saved successfully
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 500 for internal errors
     *    Body:
     *      - for non 201 status: { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     *      - for 403 status::
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     */
    static async saveEncryptedIp(req, res) {
        log.debug("Start saving encrypted IP.");
        const endpointNumber = SAVE_ENCRYPTED_IP_EP_NUMBER;

        try {
            const data = ControllerUtils.addWalletIdAndSessionId(req, ControllerUtils.addClientIpHash(req, req.body));
            const isRequestValid = await ControllerUtils.validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.saveEncryptedIpScheme,
                endpointNumber
            );

            if (isRequestValid) {
                log.debug("Request is valid, saving encrypted IP.");
                await EncryptedIpsService.saveIP(data.walletId, data.encryptedIp, data.ipHash);

                log.debug("Encrypted IP has been saved, sending 201.");
                ControllerUtils.processSuccess(res, 201);
            }
        } catch (e) {
            ControllerUtils.processInternalError(res, endpointNumber, "Error occurred during the saving of encrypted IP. ", e);
        }
    }

    /**
     * Gets encrypted IPs.
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
     *      - 200 if encrypted IPs retrieved successfully
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 404 if IPs are not found
     *      - 500 for internal errors
     *    Body:
     *      - for 200 status: { "encryptedIps": ["<encrypted_IP_string>", ... ] },
     *      - for 404 status: { "encryptedIps": [] },
     *      - for 403 status::
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     *      - for other status: { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     */
    static async getEncryptedIps(req, res) {
        log.debug("Start getting encrypted IPs.");
        const endpointNumber = GET_ENCRYPTED_IPS_EP_NUMBER;

        try {
            const data = ControllerUtils.addWalletIdAndSessionId(req, ControllerUtils.addClientIpHash(req, {}));
            const isRequestValid = await ControllerUtils.validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.getEncryptedIpsScheme,
                endpointNumber
            );

            if (isRequestValid) {
                log.debug("Request is valid, getting encrypted IPs.");
                const encryptedIps = await EncryptedIpsService.getAllEncryptedIPs(data.walletId);

                if (!encryptedIps || !encryptedIps.length) {
                    log.debug("Encrypted IPs have not been found, sending 404.");
                    res.status(404).json({ encryptedIps: [] });
                } else {
                    log.debug("Encrypted IPs have been retrieved, sending 200 and them.");
                    ControllerUtils.processSuccess(res, 200, { encryptedIps });
                }
            }
        } catch (e) {
            ControllerUtils.processInternalError(res, endpointNumber, "Error occurred during the getting of encrypted IPs: ", e);
        }
    }

    /**
     * Removes encrypted IPs.
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "walletId" - string
     *    - "sessionId" - string
     * 2. Query:
     *    - "clientIpHash" - string
     * 3. Body json format:
     *    - { "ipHashes": [ "<ipHash_string>", .. ] }
     * It sends:
     *    HTTP Code:
     *      - 204 if encrypted IPs successfully removed
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 500 for internal errors
     *    Body:
     *      - for 403 status::
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     *      - for non 204 statuses: { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }

     */
    static async deleteEncryptedIps(req, res) {
        log.debug("Start deleting encrypted IPs.");
        const endpointNumber = DELETE_ENCRYPTED_IPS_EP_NUMBER;

        try {
            const data = ControllerUtils.addWalletIdAndSessionId(req, ControllerUtils.addClientIpHash(req, req.body));
            const isRequestValid = await ControllerUtils.validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.deleteEncryptedIpsScheme,
                endpointNumber
            );

            if (isRequestValid) {
                log.debug("Request is valid, start deletion of encrypted IPs.");
                await EncryptedIpsService.deleteEncryptedIps(data.walletId, data.ipHashes);
                /**
                 * NOTE: if there is no IP with one of given hashes than we still return success as the result is
                 * still being achieved - there is no such document in DB
                 */
                log.debug("Encrypted IPs have been deleted, sending 204.");
                ControllerUtils.processSuccess(res, 204);
            }
        } catch (e) {
            ControllerUtils.processInternalError(res, endpointNumber, "Error occurred during the deletion of encrypted IPs. ", e);
        }
    }

    /**
     * Checks whether given IP's hash present.
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "walletId" - string
     *    - "sessionId" - string
     * 2. Query:
     *    - "clientIpHash" - string
     *    - "ipHash" - string
     *
     * It sends:
     *    HTTP Code:
     *      - 200 if present
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 404 if not present
     *      - 500 for internal errors
     *    Body:
     *      - for 403 status::
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     *      - for other status: { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     */
    static async isIpHashPresent(req, res) {
        log.debug("Start checking IP address presence.");
        const endpointNumber = IS_IP_HASH_PRESENT_EP_NUMBER;

        try {
            const data = ControllerUtils.addWalletIdAndSessionId(req, ControllerUtils.addClientIpHash(req, { ipHash: req.query && req.query.ipHash }));
            const isRequestValid = await ControllerUtils.validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.isIpHashPresentScheme,
                endpointNumber
            );

            if (isRequestValid) {
                log.debug("Request is valid, checking ip hash.");
                const isPresent = await EncryptedIpsService.isIpHashWhitelisted(data.walletId, data.ipHash);

                if (isPresent) {
                    log.debug("Encrypted IP is present, sending 200.");
                    ControllerUtils.processSuccess(res, 200);
                } else {
                    ControllerUtils.processSuccess(res, 404);
                    log.debug("Encrypted IP is not present, sending 404.");
                }
            }
        } catch (e) {
            ControllerUtils.processInternalError(res, endpointNumber, "Error occurred during checking presence of IP hash. ", e);
        }
    }
}
