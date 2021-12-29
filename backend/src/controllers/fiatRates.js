import { getLogger } from "log4js";
import {
    addClientIpHash,
    addWalletIdAndSessionId,
    processSuccess,
    processInternalError,
    validateRequestDataAndResponseOnErrors,
} from "./controllerUtils";
import schemas from "../models/joi_schemas";
import { GET_FIAT_RATE_FOR_SPECIFIC_DATE_EP_NUMBER, GET_FIAT_RATES_EP_NUMBER } from "./endpointNumbers";
import FiatRatesService from "../services/fiatRatesService";

const log = getLogger("fiatRatesController");

export default class FiatRatesController {
    /**
     * Returns fiat rates array for dates timestamps
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "sessionId" - not empty string
     * 2. Query:
     *    - "clientIpHash" - not empty string
     * 3. Path params:
     *    - "walletId" - not empty string
     *
     * It sends:
     *    HTTP Code:
     *      - 200 if rates data is successfully retrieved
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 500 for internal errors
     *    Body:
     *      - for non 200 status
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     *      - for 403 status:
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     *      - for 200 status:
     *        [ [ number, number ], ... ] - Array of pairs [timestamp, rate]
     */
    static async getFiatRates(req, res) {
        log.debug("Start getting fiat rates.");
        const endpointNumber = GET_FIAT_RATES_EP_NUMBER;
        try {
            const data = addWalletIdAndSessionId(req, addClientIpHash(req, {}));
            const isRequestValid = await validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.getFiatRates,
                endpointNumber
            );

            if (isRequestValid) {
                log.debug("Request is valid. Start getting rates.");

                const ratesData = await FiatRatesService.getAllRatesData();

                log.debug("Rates were retrieved, sending 200 and rates array.");
                processSuccess(res, 200, ratesData);
            }
        } catch (e) {
            processInternalError(res, endpointNumber, "Failed to get rates due to internal error. ", e);
        }
    }

    /**
     * Returns rate for specific date or null
     *
     * Request should have following params with valid values:
     * 1. Cookies:
     *    - "sessionId" - not empty string
     * 2. Query:
     *    - "clientIpHash" - not empty string
     * 3. Path params:
     *    - "walletId" - not empty string
     *
     * It sends:
     *    HTTP Code:
     *      - 200 if rate is successfully retrieved
     *      - 400 if there are data validation errors
     *      - 403 if session is invalid or ip is not allowed
     *      - 500 for internal errors
     *    Body:
     *      - for non 200 status
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     *      - for 403 status:
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string>,
     *          authorizationError: { result: false, reason: ("forbidden_ip"|"session_expired"|"session_not_found") } }
     *      - for 404 status:
     *          empty body
     *      - for 200 status:
     *        { t: number, r: number }
     */
    static async getFiatRateForSpecificDate(req, res) {
        log.debug("Start getting fiat rate.");
        const endpointNumber = GET_FIAT_RATE_FOR_SPECIFIC_DATE_EP_NUMBER;
        try {
            const timestamp = req.params && req.params.timestamp;
            const data = addWalletIdAndSessionId(req, addClientIpHash(req, { timestamp }));
            const isRequestValid = await validateRequestDataAndResponseOnErrors(
                res,
                data,
                schemas.getFiatRateForSpecificDate,
                endpointNumber
            );

            if (isRequestValid) {
                log.debug(`Request is valid. Start getting rate for the timestamp: ${timestamp}`);

                const rateData = await FiatRatesService.getRateDataForSpecificDate(+timestamp);

                if (rateData) {
                    log.debug(`Rate was retrieved, sending 200 and rate object: ${rateData}`);
                    processSuccess(res, 200, rateData);
                } else {
                    res.status(404).json();
                    log.debug("Rate was not found, sending 404");
                }
            }
        } catch (e) {
            processInternalError(res, endpointNumber, "Failed to get rate due to internal error. ", e);
        }
    }
}
