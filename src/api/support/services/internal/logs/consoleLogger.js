import { LOG_LEVEL } from "../../../../../properties.js";

// TODO: [feature, high] Improve logger logic with new levels and other stuff
export class ConsoleLogger {
    static debug(logString, source) {
        if (LOG_LEVEL === "debug" || LOG_LEVEL === "trace") {
            this._log(logString, source);
        }
    }

    static trace(logString, source) {
        if (LOG_LEVEL === "trace") {
            this._log(logString, source);
        }
    }

    /**
     * Logs to client console according to selected level.
     *
     * @param logString {string} log string
     * @param source {string} source of the log entry
     */
    static _log(logString, source) {
        const timestamp = new Date().toISOString();
        // eslint-disable-next-line no-console
        console.log(`${timestamp} - ${source ?? ""} ${logString ?? ""}`);
    }
}
