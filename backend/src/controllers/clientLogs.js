import log4js from "log4js";

import { ControllerUtils, processWrongRequestData } from "./controllerUtils.js";
import { ClientLogsService } from "../services/clientLogsService.js";
import { DOWNLOAD_CLIENT_LOG_FILE_EP_NUMBER, SAVE_CLIENT_LOGS_EP_NUMBER } from "./endpointNumbers.js";

const log = log4js.getLogger("clientLogs");

export default class ClientLogs {
    /**
     * Saves logs string from request body to the file on server. Filename would be <logsId>.log
     *
     * Request should have following params with valid values:
     * 1. Path params:
     *    - "logsId" - not empty string
     *
     * It sends:
     *    HTTP Code:
     *      - 201 if logs successfully saved to file
     *      - 400 if there are data validation errors
     *      - 500 for internal errors
     *    Body:
     *      - for non 201 status
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     *      - for 201 status:
     *        <empty body>
     */
    static async saveClientLogsToFile(req, res) {
        log.debug("Start saving client logs.");

        const endpointNumber = SAVE_CLIENT_LOGS_EP_NUMBER;
        try {
            if (!req.body) {
                processWrongRequestData(res, endpointNumber, "Body should not be empty.", "Add logs to the body");
            }
            if (!req.params || !req.params.logsId) {
                processWrongRequestData(
                    res,
                    endpointNumber,
                    "logsId is not passed.",
                    "Add logsId to the URL as path parameter"
                );
            }

            log.debug("Request is valid, start saving logs.");

            await ClientLogsService.saveLogsAsFile(req.params.logsId, req.body);

            log.debug("Logs saved successfully. Sending 201.");
            ControllerUtils.processSuccess(res, 201);
        } catch (e) {
            ControllerUtils.processInternalError(res, endpointNumber, "Failed to save client logs to file", e);
        }
    }

    /**
     * Downloads logs file if present by logsId path parameter
     *
     * Request should have following params with valid values:
     * 1. Path params:
     *    - "logsId" - not empty string
     *
     * It sends:
     *    HTTP Code:
     *      - 200 if logs file successfully downloaded
     *      - 400 if there are data validation errors
     *      - 404 if the file with such logs id is not present
     *      - 500 for internal errors
     *    Body:
     *      - for 404 status:
     *        <empty_body>
     *      - for non 200 status:
     *        { description: <message_string>, errorCodeInternal: <number>, howToFix: <message_string> }
     *      - for 200 status:
     *        downloads file
     */
    static async downloadLogsFileById(req, res) {
        log.debug("Start downloading logs file.");

        const endpointNumber = DOWNLOAD_CLIENT_LOG_FILE_EP_NUMBER;
        try {
            if (!req.params || !req.params.logsId) {
                processWrongRequestData(
                    res,
                    endpointNumber,
                    "logsId is not passed.",
                    "Add logsId to the URL as path parameter"
                );
            }

            log.debug("Request is valid, start downloading logs.");

            const filePath = await ClientLogsService.getFileNameToDownloadByLogsId(req.params.logsId);

            if (filePath) {
                log.debug("File found. Downloading logs.");
                res.download(filePath);
            } else {
                log.debug("Logs file was not found. Sending 404.");
                ControllerUtils.processSuccess(res, 404);
            }
        } catch (e) {
            ControllerUtils.processInternalError(res, endpointNumber, "Failed to save client logs to file", e);
        }
    }
}
