import { doApiCall, urlWithPrefix } from "../../../common/backend-api/utils";
import { improveAndRethrow } from "../../../common/utils/errorUtils";

export class WalletDataApi {
    /**
     * Saves preference on server
     *
     * @param walletId - id of wallet
     * @param preferenceName - name of preference to be saved
     * @param preferenceValue - string value of preference to be saved
     * @return Promise resolving to void
     */
    static async savePreference(walletId, preferenceName, preferenceValue) {
        try {
            const url = `${urlWithPrefix}/wallets/${walletId}/settings`;

            await doApiCall(url, "put", { [preferenceName]: preferenceValue }, 204, "Failed to save preference");
        } catch (e) {
            improveAndRethrow(e, "savePreference");
        }
    }

    /**
     * Retrieves wallet data
     *
     * @param walletId - id of wallet to get data for
     * @return Promise resolving to data object:
     *         {
     *             walletId: string,
     *             creationTime: timestamp(number),
     *             lastPasswordChangeDate: timestamp(number),
     *             settings: {
     *                  currencyCode: string | null,
     *                  addressesType: string | null,
     *                  lastNotificationsViewTimestamp: timestamp(number),
     *                  showFeeRates: boolean,
     *             },
     *         }
     */
    static async getWalletData(walletId) {
        try {
            const url = `${urlWithPrefix}/wallets/${walletId}`;

            return await doApiCall(url, "get", null, 200);
        } catch (e) {
            improveAndRethrow(e, "getWalletData");
        }
    }
}
