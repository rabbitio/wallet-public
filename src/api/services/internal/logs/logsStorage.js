import { getLogs, removeLogs, saveLogs } from "../storage";
import { logError } from "../../../utils/errorUtils";
import { IS_TESTING } from "../../../../properties";

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

    static _saveToTheDisk() {
        try {
            const existingLogs = getLogs();
            saveLogs(`${existingLogs}\n${this._inMemoryStorage.join("\n")}`);
            this._inMemoryStorage = [];
        } catch (e) {
            logError(e, "_saveToTheDisk", "Failed to save logs to disk");
        }
    }

    static _removeAllClientLogs() {
        removeLogs();
        this._inMemoryStorage = [];
    }
}

!IS_TESTING && setInterval(() => LogsStorage._saveToTheDisk(), 10000);
