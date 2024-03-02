import { improveAndRethrow } from "@rabbitio/ui-kit";

import { doApiCall, urlWithPrefix } from "../../common/backend-api/utils.js";

export default class NotificationsAPI {
    static serverEndpointEntity = "notifications";

    static async getNotifications() {
        try {
            const errorMessage = "Failed to get notifications. ";
            const endpoint = `${urlWithPrefix}/${this.serverEndpointEntity}`;
            return await doApiCall(endpoint, "get", {}, [200, 404], errorMessage);
        } catch (e) {
            improveAndRethrow(e, "getNotifications");
        }
    }
}
