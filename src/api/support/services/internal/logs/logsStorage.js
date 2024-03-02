import { Storage } from "../../../../common/services/internal/storage.js";
import { logError } from "../../../../common/utils/errorUtils.js";

export class LogsStorage {
    static _inMemoryStorage = [];

    static saveLog(log) {
        this._inMemoryStorage.push(log);
    }

    static getInMemoryLogs() {
        return this._inMemoryStorage;
    }

    static getAllLogs() {
        return `${Storage.getLogs()}\n${this._inMemoryStorage.join("\n")}`;
    }

    static saveToTheDisk() {
        try {
            const existingLogs = Storage.getLogs();
            Storage.saveLogs(`${existingLogs}\n${this._inMemoryStorage.join("\n")}`);
            this._inMemoryStorage = [];
        } catch (e) {
            logError(e, "saveToTheDisk", "Failed to save logs to disk");
        }
    }

    static removeAllClientLogs() {
        const doNotRemoveClientLogsWhenSignedOut = Storage.getDoNotRemoveClientLogsWhenSignedOut();
        if (doNotRemoveClientLogsWhenSignedOut !== "true") {
            Storage.removeLogs();
            this._inMemoryStorage = [];
        }
    }
}
