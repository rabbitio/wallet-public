import { getLogger } from "log4js";

import schemas from "../models/joi_schemas";
import {
    addClientIpHash,
    addWalletIdAndSessionId,
    DATA_VALIDATION_ERROR_ID,
    processFailedAuthentication,
    processInternalError,
    processSuccess,
    processWrongRequestData,
    validateRequestDataAndResponseOnErrors,
} from "./controllerUtils";
import WalletsService from "../services/walletsService";
import { SESSION_EXPIRATION_TIME } from "../properties";

import {
    AUTHENTICATE_EP_NUMBER,
    CHANGE_PASSWORD_EP_NUMBER,
    CHECK_PASSPHRASE_EP_NUMBER,
    CHECK_PASSWORD_EP_NUMBER,
    CREATE_WALLET_AND_SESSION_EP_NUMBER,
    DELETE_WALLET_EP_NUMBER,
    GET_WALLET_DATA_EP_NUMBER,
    LOGOUT_EP_NUMBER,
    SAVE_SETTINGS_EP_NUMBER,
} from "./endpointNumbers";

const log = getLogger("walletsController");

export default class WalletsController {
    /**
     * Creates new wallet and session for it. Saves sessionId and walletId to cookies.
     *
     * Request should have following params with valid values:
     * 1. Body JSON scheme:
     *    - {
     *          walletId: not empty string,
     *          passphraseHash: not empty string,
     *          passwordHash: not empty string,
     *          initialIndexesData: object,
     *          initialAddressesData: [
     *              {
     *                  uuid: not empty string,
     *                  encryptedAddressData: not empty string
     *              },
     *              ...
     *          ]
     *      }
     *
     * It sends:
     *    HTTP Code:
     *      - 201 if wallet with session has been created successfully
     *      - 400 if there are data validation errors or such wallet already exists
     *      - 500 for internal errors
     *    Body:
     *      - for 201 status: { sessionId: "<sessionId_string>", sessionExpirationTime: "<sessionExpirationTime_timestamp>" }
     *      - for other statuses: { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     */
    static async createWalletAndSession(req, res) {
        log.debug("Create request received.");
        const endpointNumber = CREATE_WALLET_AND_SESSION_EP_NUMBER;
        try {
            const data = req.body;
            const options = { shouldNotCheckSession: true, shouldNotCheckIp: true };
            const isRequestValid = await validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.createSchema,
                endpointNumber,
                options
            );

            if (isRequestValid) {
                log.debug("Request is valid, start creating wallet and session.");
                const wallet = await WalletsService.saveNewWalletAndCreateSession(
                    data.walletId,
                    data.passphraseHash,
                    data.passwordHash,
                    data.initialIndexesData,
                    data.initialAddressesData
                );

                if (wallet === null) {
                    const errorId = DATA_VALIDATION_ERROR_ID + 1;
                    processWrongRequestData(
                        res,
                        endpointNumber,
                        "Such Wallet Already Exists. ",
                        "You can login into it. ",
                        errorId
                    );
                } else {
                    log.debug("Session created, setting session cookies and returning 201 with wallet data.");
                    res.cookie("sessionId", wallet.sessionId, { maxAge: SESSION_EXPIRATION_TIME });
                    res.cookie("walletId", wallet.walletId);
                    processSuccess(res, 201, {
                        sessionId: wallet.sessionId,
                        sessionExpirationTime: wallet.sessionExpirationTime,
                    });
                }
            }
        } catch (e) {
            processInternalError(
                res,
                endpointNumber,
                "Internal error occurred during the creation of wallet with session. ",
                e
            );
        }
    }

    /**
     * Performs authentication.
     *
     * Request should have following params with valid values:
     * 1. Query:
     *    - "clientIpHash" - not empty string
     * 2. Body json scheme:
     *    - { walletId: not empty string, passwordHash: not empty string }
     *
     * It Sends:
     *    HTTP Code:
     *      - 201 if authenticated successfully
     *      - 400 if there are data validation errors
     *      - 403 if authentication failed or ip is not allowed
     *      - 500 for internal errors
     *    Body:
     *      - for 201 status:
     *        { result: "true", sessionId: "<sessionId>"}
     *      - for 403 status one of two objects:
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: "forbidden_ip" } }
     *        or
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>, authenticationError: { ... } }
     *          authenticationError object is one of:
     *          1. { result: false, reason: "walletId" } - wallet id was not found
     *          2. { result: false, reason: "locked", millisecondsToWaitForUnlocking: number } - wallet has been locked due to lots of failed
     *             login attempts, use millisecondsToWaitForUnlocking to know waiting period
     *          3. { result: false, reason: "password", attemptsRemained: 2 } - password is wrong, you have only returned
     *             number of login attempts before lock of wallet
     *          4. { result: false, reason: "password", lockPeriodMs: <milliseconds to wait for unlocking> } - you have lost
     *             your last attempt to login due to wrong password, wait lockPeriodMs and try again
     *          5. { result: false, reason: "passphrase" } - passphrase given is not correct
     *      - for other statuses:
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     */
    static async authenticate(req, res) {
        log.debug("Start authentication.");
        const endpointNumber = AUTHENTICATE_EP_NUMBER;
        try {
            const data = addClientIpHash(req, req.body);
            const options = { shouldNotCheckSession: true };
            const isRequestValid = await validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.authenticateSchema,
                endpointNumber,
                options
            );

            if (isRequestValid) {
                log.debug("Request is valid, start authentication.");
                const checkResult = await WalletsService.checkPasswordAndCreateSession(
                    data.walletId,
                    data.passphraseHash,
                    data.passwordHash
                );

                if (checkResult.result) {
                    log.debug("Authenticated with new session id, setting cookies and sending 201 with check result.");
                    res.cookie("sessionId", checkResult.sessionId, { maxAge: SESSION_EXPIRATION_TIME });
                    res.cookie("walletId", req.body.walletId); // TODO: [refactoring, low/maybe] Remove it from cookies
                    processSuccess(res, 201, checkResult);
                } else {
                    log.info("Authentication failed, sending 403 and error object. ");
                    processFailedAuthentication(res, endpointNumber, checkResult);
                }
            }
        } catch (e) {
            processInternalError(res, endpointNumber, "Internal error occurred during the authentication. ", e);
        }
    }

    /**
     * Checks Passphrase validity.
     *
     * Request should have following params with valid values:
     * 1. Query:
     *    - "clientIpHash" - not empty string
     * 2. Body json scheme:
     *    - { walletId: not empty string, passphraseHash: not empty string }
     *
     * It Sends:
     *    HTTP Code:
     *      - 200 if passphrase successfully checked
     *      - 400 if there are data validation errors
     *      - 500 for internal errors
     *    Body:
     *      - for 200 status one of:
     *        1. { result: true } - passphrase is valid
     *        2. { result: false, reason: "walletId" } - wallet id was not found
     *        3. { result: false, reason: "passphrase" } - passphrase is not valid
     *      - for other statuses:
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     */
    static async checkPassphrase(req, res) {
        log.debug("Start checking passphrase.");
        const endpointNumber = CHECK_PASSPHRASE_EP_NUMBER;
        try {
            const passphraseHash = req.query && req.query.passphraseHash;
            const data = addWalletIdAndSessionId(req, { passphraseHash });
            delete data["sessionId"];
            const options = { shouldNotCheckSession: true, shouldNotCheckIp: true };
            const isRequestValid = await validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.checkPassphraseSchema,
                endpointNumber,
                options
            );

            if (isRequestValid) {
                log.debug("Request is valid, start checking passphrase.");
                const checkResult = await WalletsService.checkPassphrase(data.walletId, data.passphraseHash);

                log.debug("Successfully checked. Returning check result");
                processSuccess(res, 200, checkResult);
            }
        } catch (e) {
            processInternalError(res, endpointNumber, "Internal error occurred during the passphrase checking. ", e);
        }
    }

    /**
     * Retrieves wallet data.
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "walletId" - not empty string
     *    - "sessionId" - not empty string
     * 2. Query:
     *    - "clientIpHash" - not empty string
     *
     * It sends:
     *    HTTP Code:
     *      - 200 if data is returned successfully
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 500 for internal errors
     *    Body:
     *      - for non 200 status: { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     *      - for 403 status::
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     *      - for 200 status:
     *        { walletId: not empty string, creationTime: Date , lastPasswordChangeDate: Date, settings: object }
     */
    static async getWalletData(req, res) {
        log.debug("Start getting wallet data.");
        const endpointNumber = GET_WALLET_DATA_EP_NUMBER;
        try {
            const data = addWalletIdAndSessionId(req, addClientIpHash(req, {}));
            const isRequestValid = await validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.getWalletDataSchema,
                endpointNumber
            );

            if (isRequestValid) {
                log.debug("Request is valid, retrieving data.");
                const walletData = await WalletsService.getWalletData(data.walletId);

                log.debug("Data has been retrieved. Sending 200 and returning data.");
                processSuccess(res, 200, {
                    walletId: walletData.walletId,
                    creationTime: walletData.creationTime,
                    lastPasswordChangeDate: walletData.lastPasswordChangeDate,
                    settings: walletData.settings,
                });
            }
        } catch (e) {
            processInternalError(res, endpointNumber, "Internal error occurred during the data retrieval. ", e);
        }
    }

    /**
     * Performs logout - removes current session.
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "walletId" - not empty string
     *    - "sessionId" - not empty string
     * 2. Query:
     *    - "clientIpHash" - not empty string
     *
     * It sends:
     *    HTTP Code:
     *      - 200 if logged out successfully
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 500 for internal errors
     *    Body:
     *      - for non 200 status: { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     *      - for 403 status::
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     *      - empty for 200 status
     */
    static async logout(req, res) {
        log.debug("Start logout.");
        const endpointNumber = LOGOUT_EP_NUMBER;
        try {
            const data = addWalletIdAndSessionId(req, addClientIpHash(req, {}));
            const isRequestValid = await validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.logoutSchema,
                endpointNumber
            );

            if (isRequestValid) {
                log.debug("Request is valid, removing session.");
                await WalletsService.removeSession(data.sessionId);
                res.cookie("sessionId", "", { maxAge: -1 });

                log.debug("Session has been removed (+ from cookies). Sending 200.");
                processSuccess(res, 200);
            }
        } catch (e) {
            processInternalError(res, endpointNumber, "Internal error occurred during the logout. ", e);
        }
    }

    /**
     * Deletes wallet and all related stuff.
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "walletId" - not empty string
     *    - "sessionId" - not empty string
     * 2. Query:
     *    - "clientIpHash" - not empty string
     *
     * It sends:
     *    HTTP Code:
     *      - 200 if password is wrong and wallet is not deleted
     *      - 204 if wallet is successfully deleted
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 500 for internal errors
     *    Body:
     *      - for 200:
     *        { result: false }
     *      - empty for 204
     *      - for other statuses
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     *      - for 403 status::
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     */
    static async deleteWallet(req, res) {
        log.info("Start deleting wallet.");
        const endpointNumber = DELETE_WALLET_EP_NUMBER;
        try {
            const passwordHash = req.query && req.query.passwordHash;
            const data = addWalletIdAndSessionId(req, addClientIpHash(req, { passwordHash }));
            const isRequestValid = await validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.deleteWalletSchema,
                endpointNumber
            );

            if (isRequestValid) {
                log.info("Request data is valid, start wallet deletion.");

                const result = await WalletsService.deleteWallet(data.walletId, passwordHash);

                log.info(
                    `Wallet has ${result.result ? "" : "not "}been deleted. Sending 20${result.result ? "4" : "0"}.`
                );
                result.result && processSuccess(res, 204, { result: true });
                !result.result && processSuccess(res, 200, { result: false });
            }
        } catch (e) {
            processInternalError(res, endpointNumber, "Failed to delete wallet due to internal error. ", e);
        }
    }

    /**
     * Checks that given password corresponds to given wallet
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "walletId" - not empty string
     *    - "sessionId" - not empty string
     * 2. Query:
     *    - "clientIpHash" - not empty string
     *    - "passwordHash" - not empty string
     *
     * It sends:
     *    HTTP Code:
     *      - 200 if password is successfully checked
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 500 for internal errors
     *    Body:
     *      - for 200 status:
     *        { result: boolean }
     *      - for non 200 statuses
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     *      - for 403 status::
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     */
    static async checkPassword(req, res) {
        log.info("Start checking the password.");
        const endpointNumber = CHECK_PASSWORD_EP_NUMBER;
        try {
            const passwordHash = req.query && req.query.passwordHash;
            const data = addWalletIdAndSessionId(req, addClientIpHash(req, { passwordHash }));
            const isRequestValid = await validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.checkPasswordSchema,
                endpointNumber
            );

            if (isRequestValid) {
                log.info("Request data is valid, start checking the password.");

                const result = await WalletsService.checkPassword(data.walletId, data.passwordHash);

                log.info("Password has been checked. Sending 200 and check result.");
                processSuccess(res, 200, { result });
            }
        } catch (e) {
            processInternalError(res, endpointNumber, "Failed to check the password due to internal error. ", e);
        }
    }

    /**
     * Changes password if old hash is valid
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "walletId" - not empty string
     *    - "sessionId" - not empty string
     * 2. Query:
     *    - "clientIpHash" - not empty string
     * 3. Body:
     *    - "passwordHash" - not empty string
     *    - "newPasswordHash" - not empty string
     *
     * It sends:
     *    HTTP Code:
     *      - 200 if password is changed or old hash is not valid
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 500 for internal errors
     *    Body:
     *      - for 200 status:
     *        { result: boolean }
     *      - for non 200 statuses
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     *      - for 403 status::
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     */
    static async changePassword(req, res) {
        log.info("Start changing password.");
        const endpointNumber = CHANGE_PASSWORD_EP_NUMBER;
        try {
            const data = addWalletIdAndSessionId(req, addClientIpHash(req, req.body));
            const isRequestValid = await validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.changePasswordSchema,
                endpointNumber
            );

            if (isRequestValid) {
                log.info("Request data is valid, start changing the password.");

                const result = await WalletsService.changePassword(
                    data.walletId,
                    data.passwordHash,
                    data.newPasswordHash
                );

                log.info("Password has been changed. Sending 200.");
                processSuccess(res, 200, result);
            }
        } catch (e) {
            processInternalError(res, endpointNumber, "Failed to change the password due to internal error. ", e);
        }
    }

    /**
     * Saves wallet settings
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "walletId" - not empty string
     *    - "sessionId" - not empty string
     * 2. Query:
     *    - "clientIpHash" - not empty string
     * 3. Body:
     *    {
     *        "currencyCode": string,
     *        "addressesType": string,
     *        "lastNotificationsViewTimestamp: string,
     *        "showFeeRates: string,
     *    }
     *
     * It sends:
     *    HTTP Code:
     *      - 204 if settings are saved
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 500 for internal errors
     *    Body:
     *      - empty for 204
     *      - for non 204 statuses
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     *      - for 403 status::
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     */
    static async saveSettings(req, res) {
        log.info("Start saving settings.");
        const endpointNumber = SAVE_SETTINGS_EP_NUMBER;
        try {
            const data = addWalletIdAndSessionId(req, addClientIpHash(req, { settings: req.body }));
            const isRequestValid = await validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.saveSettingsSchema,
                endpointNumber
            );

            if (isRequestValid) {
                log.info("Request data is valid, start saving settings.");

                await WalletsService.saveSettings(data.walletId, req.body);

                log.info("Settings been saved. Sending 204.");
                processSuccess(res, 204);
            }
        } catch (e) {
            processInternalError(res, endpointNumber, "Failed to save settings due to internal error. ", e);
        }
    }
}
