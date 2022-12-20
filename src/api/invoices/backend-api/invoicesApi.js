import { ApiCallWrongResponseError, doApiCall, urlWithPrefix } from "../../common/backend-api/utils";
import { improveAndRethrow } from "../../common/utils/errorUtils";

const serverEndpointEntity = "encryptedInvoices";

// TODO: [tests, moderate] Implement unit tests
export default class InvoicesApi {
    static async saveInvoice(walletId, invoiceUuid, encryptedInvoiceData) {
        try {
            const errorMessage = "Failed to save new encrypted invoice on server. ";
            const data = { walletId, invoiceUuid, encryptedInvoiceData };
            return await doApiCall(`${urlWithPrefix}/${serverEndpointEntity}`, "post", data, 201, errorMessage);
        } catch (e) {
            improveAndRethrow(e, "saveInvoice");
        }
    }

    static async getInvoicesList(walletId, invoicesUuids = []) {
        try {
            const errorMessage = "Failed to get encrypted invoices from server. ";
            const endpoint = `${urlWithPrefix}/${serverEndpointEntity}?invoicesUuids=${invoicesUuids.join(",")}`;
            return await doApiCall(endpoint, "get", null, 200, errorMessage);
        } catch (e) {
            if (e instanceof ApiCallWrongResponseError && e.isNotFoundError()) {
                return [];
            }

            improveAndRethrow(e, "getInvoicesList");
        }
    }

    static async deleteInvoices(walletId, invoicesUuids) {
        try {
            const errorMessage = "Failed to delete invoices on server. ";
            const data = { walletId, invoicesUuids };
            await doApiCall(`${urlWithPrefix}/${serverEndpointEntity}`, "delete", data, 204, errorMessage);

            return "ok";
        } catch (e) {
            if (e instanceof ApiCallWrongResponseError && e.isNotFoundError()) {
                return null;
            }

            improveAndRethrow(e, "deleteInvoices");
        }
    }
}
