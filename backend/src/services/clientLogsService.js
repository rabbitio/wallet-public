import fsExtra from "fs-extra";
import path from "path";
import { getLogger } from "log4js";
import { MAX_CLIENT_LOGS_LIFETIME_MS } from "../../../properties/server/envs/prod";

const log = getLogger("clientLogsService");

export class ClientLogsService {
    static _LOGS_PATH = path.join(__dirname, "../../log/client");

    static async saveLogsAsFile(id, logsString) {
        try {
            log.debug(`Start saving logs file. id: ${id}`);

            await fsExtra.writeFile(`${this._LOGS_PATH}/${id}.log`, logsString, "utf-8");

            log.debug(`Logs were saved to file. id: ${id}`);
        } catch (e) {
            log.error(e, "saveLogsAsFile");
        }
    }

    static async getFileNameToDownloadByLogsId(id) {
        try {
            log.debug(`Start composing filename to download logs: ${id}`);
            const filePath = path.join(ClientLogsService._LOGS_PATH, `${id}.log`);

            try {
                await fsExtra.stat(filePath);
            } catch (e) {
                log.debug(`Requested file doesn't exist: ${filePath}. returning null`);
                return null;
            }

            log.debug(`Requested file exists for id: ${id}. returning file path`);
            return filePath;
        } catch (e) {
            log.error(e, "getFileNameToDownloadByLogsId");
        }
    }

    static async ensureLogsDirectory() {
        try {
            log.debug(`Start ensuring logs directory.`);

            await fsExtra.ensureDir(this._LOGS_PATH);

            log.debug(`Client logs directory presence was ensured.`);
        } catch (e) {
            log.error(e, "ensureLogsDirectory");
        }
    }

    static async removeOldLogFiles() {
        try {
            log.debug(`Start removing old client log files in path: ${ClientLogsService._LOGS_PATH}`);

            const files = await fsExtra.readdir(ClientLogsService._LOGS_PATH);
            const filesToRemove = [];
            for (let i = 0; i < files.length; ++i) {
                const stat = await fsExtra.stat(path.join(ClientLogsService._LOGS_PATH, files[i]));
                if (Date.now() - MAX_CLIENT_LOGS_LIFETIME_MS > stat.mtime) {
                    filesToRemove.push(files[i]);
                }
            }

            log.debug(`Removing ${filesToRemove.length} files.`);

            for (let i = 0; i < filesToRemove.length; ++i) {
                log.debug(`Removing ${filesToRemove[i]} log.`);
                await fsExtra.remove(path.join(ClientLogsService._LOGS_PATH, filesToRemove[i]));
            }

            log.debug(`Old client log files was removed.`);
        } catch (e) {
            log.error(e, "removeOldLogFiles");
        }
    }
}

(async () => await ClientLogsService.ensureLogsDirectory())();

setInterval(ClientLogsService.removeOldLogFiles, 3 * 60 * 60 * 1000);
