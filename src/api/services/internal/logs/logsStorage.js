import { getLogs, getDoNotRemoveClientLogsWhenSignedOut, removeLogs, saveLogs } from "../storage";
import { logError } from "../../../utils/errorUtils";

export class LogsStorage {
    static _inMemoryStorage = [];

    static saveLog(log) {
        this._inMemoryStorage.push(log);
    }

    static getInMemoryLogs() {
        return this._inMemoryStorage;
    }

    static getAllLogs() {
        return `${getLogs()}\n${this._inMemoryStorage.join("\n")}`;
    }

    static saveToTheDisk() {
        try {
            const existingLogs = getLogs();
            saveLogs(`${existingLogs}\n${this._inMemoryStorage.join("\n")}`);
            this._inMemoryStorage = [];
        } catch (e) {
            logError(e, "saveToTheDisk", "Failed to save logs to disk");
        }
    }

    static removeAllClientLogs() {
        const doNotRemoveClientLogsWhenSignedOut = getDoNotRemoveClientLogsWhenSignedOut();
        if (doNotRemoveClientLogsWhenSignedOut !== "true") {
            removeLogs();
            this._inMemoryStorage = [];
        }
    }
}
