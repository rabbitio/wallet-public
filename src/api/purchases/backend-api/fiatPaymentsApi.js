import { doApiCall, urlWithPrefix } from "../../common/backend-api/utils";
import { improveAndRethrow } from "../../common/utils/errorUtils";

const serverEndpointEntity = "fiatPayments";

export default class FiatPaymentsApi {
    static async getPaymentsNotifications(walletId, paymentIds) {
        try {
            const errorMessage = "Failed to get payment notifications. ";
            const result = await doApiCall(
                `${urlWithPrefix}/${serverEndpointEntity}/getNotifications`,
                "post",
                { paymentIds },
                [200, 404],
                errorMessage
            );

            if (result === null) {
                return [];
            }

            return result;
        } catch (e) {
            improveAndRethrow(e, "getPaymentsNotifications");
        }
    }

    static async getTransactionsToPaymentsMapping(walletId, paymentIds) {
        try {
            const errorMessage = "Failed to get payment notifications. ";
            const result = await doApiCall(
                `${urlWithPrefix}/${serverEndpointEntity}/getMapping`,
                "post",
                { paymentIds },
                [200, 404],
                errorMessage
            );

            if (result === null) {
                return [];
            }

            return result;
        } catch (e) {
            improveAndRethrow(e, "getPaymentsNotifications");
        }
    }
}
