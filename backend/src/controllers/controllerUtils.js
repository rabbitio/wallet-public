import { getLogger } from "log4js";

import { improveAndRethrow } from "../utils/utils";
import EncryptedIpsService from "../services/encryptedIpsService";
import walletsService from "../services/walletsService";
import { dbConnectionHolder } from "../utils/dbConnectionHolder";
import { joiValidate } from "../utils/joiValidationWrapper";

const log = getLogger("controllerUtils");

export const DATA_VALIDATION_ERROR_ID = 1;

/**
 * Validates given request and send response for standard errors.
 *
 * @param res - response to be sent if needed
 * @param data - json data to be checked by given scheme
 *               - should contain walletId parameter to check session/ip (excepting case when the shouldNotCheckIp is false)
 *               - should contain sessionId parameter (excepting case when the shouldNotCheckSession is false)
 *               - should contain clientIpHash parameter (excepting case when the shouldNotCheckIp is false)
 * @param scheme - scheme to check given data
 * @param endpointNumber - number of endpoint received this request
 * @param options - object of options:
 *                  {
 *                      shouldNotCheckSession: true/false, // Whether we should not check session
 *                      shouldNotCheckIp: true/false, // Whether we should not check ip
 *                      howToFixValidationError: "message" // Additional message for validation errors about possible fix
 *                  }
 * @returns Promise resolving to true if request is valid or false otherwise
 */
export async function validateRequestDataAndResponseOnErrors(res, data, scheme, endpointNumber, options = {}) {
    try {
        log.debug("Start validation of request data.");

        const joiResult = joiValidate(data, scheme);
        const validationError = (scheme && joiResult && joiResult.error) || null;
        if (validationError === null) {
            log.debug("Request data valid, starting authentication.");

            if (!options.shouldNotCheckSession) {
                const sessionCheckResult = await checkSession(data.walletId, data.sessionId, res);
                if (!sessionCheckResult.result) {
                    processInvalidSession(res, 403000 + endpointNumber, sessionCheckResult);
                    return false;
                }
            }

            if (!options.shouldNotCheckIp) {
                const ipCheckResult = await EncryptedIpsService.isIpHashWhitelisted(data.walletId, data.clientIpHash);
                if (!ipCheckResult) {
                    processForbiddenIp(res, 403000 + endpointNumber);
                    return false;
                }
            }

            return true;
        } else {
            if (
                validationError.message &&
                (validationError.message.includes("sessionId") || validationError.message.includes("walletId"))
            ) {
                processInvalidSession(res, 403000 + endpointNumber, { result: false, reason: "session_not_found" });
            } else if (validationError.message && validationError.message.includes("clientIpHash")) {
                processForbiddenIp(res, 403000 + endpointNumber);
            } else {
                processWrongRequestData(
                    res,
                    endpointNumber,
                    validationError,
                    options.howToFixValidationError,
                    DATA_VALIDATION_ERROR_ID
                );
            }

            return false;
        }
    } catch (e) {
        improveAndRethrow(e, "validateRequestDataAndResponseOnErrors");
    }
}

async function checkSession(walletId, sessionId, res) {
    log.debug("start checking session.");
    try {
        let sessionValidationResult = await walletsService.checkWalletSession(walletId, sessionId);

        log.debug(`Session was checked: ${JSON.stringify(sessionValidationResult)}.`);
        if (sessionValidationResult === "session_valid") {
            log.debug("Valid session was found, returning true.");
            return { result: true };
        } else if (sessionValidationResult === "session_expired" || sessionValidationResult === "session_not_found") {
            log.debug("Session was not found or expired, returning false.");
            res.cookie("sessionId", "", { maxAge: -1 });
            return { result: false, reason: sessionValidationResult };
        }
    } catch (e) {
        improveAndRethrow(e, "checkSession");
    }
}

function processInvalidSession(res, errorCodeInternal, sessionCheckResult) {
    log.info(`Session is not valid: ${JSON.stringify(sessionCheckResult)}. Sending 403 and error object.`);
    res.status(403).json({
        description: "Session not found or expired. ",
        errorCodeInternal: errorCodeInternal,
        howToFix: "Please, login again. ",
        authorizationError: sessionCheckResult,
    });
}

function processForbiddenIp(res, errorCodeInternal) {
    log.info("Ip is not allowed. Sending 403 and error object.");
    res.status(403).json({
        description: "Your IP address is not in the whitelist. ",
        errorCodeInternal: errorCodeInternal,
        howToFix: "Please, access from allowed IP. ",
        authorizationError: { result: false, reason: "forbidden_ip" },
    });
}

/**
 * Sends response about wrong request data.
 *
 * @param res - response to be sent
 * @param endpointNumber - number of endpoint sending this response (should be in [0, 999])
 * @param validationError - Joi validation error message to be parsed (if present)
 * @param howToFix - advice about possible fix of this error
 * @param errorId - id of specific error (should be in [2, 999])
 */
export function processWrongRequestData(res, endpointNumber, validationError, howToFix, errorId = 0) {
    log.debug("Start processing wrong request data.");

    let errorMessage = "Wrong request data: ";
    howToFix = howToFix || "Pass all required data in correct format. ";

    if (validationError.details) {
        log.trace("Adding Joi validation details.");
        errorMessage += validationError.details.map(detail => detail.message).reduce((a, b) => a + "; " + b);
    } else {
        log.trace("Adding validation error.");
        errorMessage += validationError;
    }

    log.info(`Composed message about the wrong request data: ${errorMessage}`);

    log.debug("Sending 400 with details. End.");
    res.status(400).json({
        description: errorMessage,
        errorCodeInternal: 400 * 1000 * 1000 + endpointNumber * 1000 + errorId,
        howToFix: howToFix,
    });
}

export function processFailedAuthentication(res, endpointNumber, checkResult) {
    const errorObject = {
        description: "Wallet was not found or password/passphrase is incorrect or wallet locked. ",
        errorCodeInternal: 403000 + endpointNumber,
        howToFix: "Check wallet identifier and password or wait for unlock. ",
        authenticationError: checkResult,
    };
    res.status(403).json(errorObject);
}

/**
 * Sends response about internal error. Also tries to fix DB error if cause is DB error.
 *
 * @param res - response to be sent
 * @param endpointNumber - number of endpoint sending this response
 * @param message - message to put in response object
 * @param e - error that caused this call
 */
export function processInternalError(res, endpointNumber, message, e) {
    log.error(message, e);

    res.status(500).json({
        description: message,
        errorCodeInternal: 500000 + endpointNumber,
        howToFix: "Contact system owner. ",
    });

    dbConnectionHolder.reconnectToDbIfNeeded();
}

export function addWalletIdAndSessionId(req, data) {
    if (!req) {
        throw new Error(`Request parameter is empty. Got ${req}. `);
    }

    if (!data) {
        throw new Error(`data parameter should be not empty but got ${data}. `);
    }

    data["walletId"] =
        (req.params && req.params.walletId) ||
        (req.cookies && req.cookies.walletId) ||
        (req.body && req.body.walletId) ||
        null;
    data["sessionId"] = (req.cookies && req.cookies.sessionId) || null;

    return data;
}

export function addClientIpHash(req, data) {
    if (!req) {
        throw new Error(`Request parameter is empty. Got ${req}. `);
    }

    if (!data) {
        throw new Error(`data parameter should be not empty but got ${data}. `);
    }

    data["clientIpHash"] = (req.query && req.query.clientIpHash) || null;

    return data;
}

export const onlyIfDoesntStartWith = (path, middleware) => {
    return function(req, res, next) {
        if (req.path.startsWith(path)) {
            // TODO: [dev] remove after dev testing
            // eslint-disable-next-line no-console
            console.log("MATCH: ", req.path, path);
            return next();
        } else {
            // TODO: [dev] remove after dev testing
            // eslint-disable-next-line no-console
            console.log("DISSS: ", req.path, path);
            return middleware(req, res, next);
        }
    };
};

export const apiVersionPrefix = "/api/v1";

export function processSuccess(res, statusCode, payload = null) {
    if (payload != null) {
        res.status(statusCode).json(payload);
    } else {
        res.status(statusCode).send();
    }
}
