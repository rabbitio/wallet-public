import { doApiCall, urlWithPrefix } from "../../common/backend-api/utils.js";

export class LogsApi {
    static path = "logs";

    /**
     * Sends logs as a string to server and saves them there with provided ID
     *
     * @param id {string} - id to use to save logs
     * @param logsString {string} - string containing logs
     * @return {Promise<void>}
     */
    static async sendLogs(id, logsString) {
        const endpoint = `${urlWithPrefix}/logs/${id}`;
        await doApiCall(
            endpoint,
            "post",
            logsString,
            201,
            "Failed to send logs to server",
            { headers: { "CONTENT-TYPE": "text/plain" } } // to avoid parsing logs as JSON on server
        );
    }
}
