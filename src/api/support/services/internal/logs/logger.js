import { LogsStorage } from "./logsStorage";

export class Logger {
    /**
     * Logs to client logs storage.
     *
     * WARNING! this method should ce used carefully for critical logging as we have the restriction for storing logs
     *          on client side as we store them inside the local storage. Please see details inside storage.js
     * @param logString {string} log string
     * @param source {string} source of the log entry
     */
    static log(logString, source) {
        const timestamp = new Date().toISOString();
        LogsStorage.saveLog(`${timestamp}|${source}:${logString}`);
    }
}
