import { improveAndRethrow } from "@rabbitio/ui-kit";

import { ApiCallWrongResponseError } from "../../common/backend-api/utils.js";
import { doApiCall, urlWithPrefix } from "../../common/backend-api/utils.js";

export class EncryptedWalletPaymentIdsApi {
    static endpoint = "encryptedWalletPaymentIds";

    /**
     * Saves given encrypted wallet payment id.
     *
     * @param walletId - id of wallet
     * @param encryptedPaymentId - encrypted payment id
     * @returns {Promise<string>} resolving to "ok"
     */
    static async saveEncryptedWalletPaymentId(walletId, encryptedPaymentId) {
        try {
            const errorMessage = "Failed to save encrypted payment id. ";
            const data = { encryptedPaymentId };

            return await doApiCall(`${urlWithPrefix}/${this.endpoint}`, "post", data, 201, errorMessage);
        } catch (e) {
            improveAndRethrow(e, "saveEncryptedWalletPaymentId");
        }
    }

    /**
     * Returns all encrypted payment ids for given walletId.
     *
     * @param walletId - id of wallet
     * @returns {Promise<Array<string>>} resolving to array of encrypted IPs
     */
    static async getAllEncryptedWalletPaymentIds(walletId) {
        try {
            const errorMessage = "Failed to get all encrypted payment ids for wallet id. ";
            const endpoint = `${urlWithPrefix}/${this.endpoint}/${walletId}`;

            const data = await doApiCall(endpoint, "get", null, 200, errorMessage);

            return data.encryptedPaymentIds;
        } catch (e) {
            if (e instanceof ApiCallWrongResponseError && e.isNotFoundError()) {
                return [];
            }

            improveAndRethrow(e, "getAllEncryptedWalletPaymentIds");
        }
    }
}
