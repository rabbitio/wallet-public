import { doApiCall, urlWithPrefix } from "./utils";
import { improveAndRethrow } from "../../utils/errorUtils";

export default class EmailsApi {
    static serverEndpointEntity = "emails";

    static async sendEmail(subject, body) {
        try {
            const errorMessage = "Failed to send email.";
            const url = `${urlWithPrefix}/${this.serverEndpointEntity}`;

            await doApiCall(url, "post", { subject, body }, 201, errorMessage);
        } catch (e) {
            improveAndRethrow(e, "sendEmail");
        }
    }
}
