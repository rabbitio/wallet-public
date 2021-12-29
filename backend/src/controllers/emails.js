import { getLogger } from "log4js";
import { processSuccess, processInternalError, validateRequestDataAndResponseOnErrors } from "./controllerUtils";
import schemas from "../models/joi_schemas";
import { SEND_EMAIL_EP_NUMBER } from "./endpointNumbers";
import EmailsService from "../services/emailsService";

const log = getLogger("emails");

export default class EmailsController {
    /**
     * Sends email
     *
     * Request should have following params with valid values:
     * 1. Body:
     *    {
     *        "subject": string, // not empty string
     *        "body": string // not empty string
     *    }
     *
     * It sends:
     *    HTTP Code:
     *      - 201 if email is successfully sent
     *      - 400 if there are data validation errors
     *      - 500 for internal errors
     *    Body:
     *      - for 201 status
     *        empty body
     *      - for non 201 status
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     */
    static async sendEmail(req, res) {
        log.debug("Start sending email.");
        const endpointNumber = SEND_EMAIL_EP_NUMBER;
        try {
            const isRequestValid = await validateRequestDataAndResponseOnErrors(
                res,
                req.body,
                schemas.sendEmail,
                endpointNumber,
                { shouldNotCheckSession: true, shouldNotCheckIp: true }
            );

            if (isRequestValid) {
                log.debug("Request is valid. Start sending email.");

                await EmailsService.sendEmail(req.body.subject, req.body.body);

                log.debug("Email has been sent, sending 201.");
                processSuccess(res, 201);
            }
        } catch (e) {
            processInternalError(res, endpointNumber, "Failed to send email due to internal error. ", e);
        }
    }
}
