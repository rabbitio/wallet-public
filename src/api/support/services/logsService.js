import { v4 } from "uuid";

import { improveAndRethrow } from "@rabbitio/ui-kit";

import { LogsApi } from "../backend-api/logsApi.js";
import { LogsStorage } from "./internal/logs/logsStorage.js";
import { Logger } from "./internal/logs/logger.js";

export default class LogsService {
    /**
     * Sends logs stored in memory and logs stored on disk to server for analysis.
     * This method should only be initiated by the user.
     *
     * @param {string} logs - logs string to be saved
     * @return {Promise<string>} unique sent logs identifier string
     */
    static async sendLogsToServer(logs) {
        const loggerSource = "sendLogsToServer";
        try {
            Logger.log(`Start sending logs to server. Length: ${logs.length}`, loggerSource);
            const logsId = v4();
            await LogsApi.sendLogs(logsId, logs);

            Logger.log(`Logs sent to server. ID: ${logsId}`, loggerSource);
            return logsId;
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    static getLogsText() {
        return LogsStorage.getAllLogs();
    }
}
