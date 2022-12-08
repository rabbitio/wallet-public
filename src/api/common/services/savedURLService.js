import { getPathWithParams } from "../utils/browserUtils";
import { Logger } from "../../support/services/internal/logs/logger";

/**
 * Provides API to save URL Path in memory and retrieve it later. Useful for cases when the user is being auto signed out.
 * So we can save the URL here before the sign out and open it back on the new login
 */
export default class SavedURLService {
    static _savedURL = null;

    static pushCurrentURLPath() {
        this._savedURL = getPathWithParams();
        Logger.log(`Current URL was pushed ${this._savedURL}`, "pushCurrentURLPath");
    }

    static pushURLPath(urlPath) {
        this._savedURL = urlPath;
        Logger.log(`URL was pushed ${urlPath}`, "pushURLPath");
    }

    static popURLPath() {
        const urlPath = this._savedURL;
        this._savedURL = null;

        return urlPath;
    }
}
