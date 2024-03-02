import { improveAndRethrow } from "@rabbitio/ui-kit";

import { ApiCallWrongResponseError, doApiCall, urlWithPrefix } from "../../../common/backend-api/utils.js";
import { UserDataAndSettings, UserSettingValue } from "../models/userDataAndSettings.js";

// TODO: [refactoring, high] Rename to AccountDataApi
export class WalletDataApi {
    /**
     * Saves preference on server
     *
     * @param walletId {string} id of wallet
     * @param preferenceName {string} name of preference to be saved
     * @param preferenceValue {string} string value of preference to be saved
     * @return {Promise<void>}
     */
    static async saveUserSetting(walletId, preferenceName, preferenceValue) {
        try {
            const url = `${urlWithPrefix}/wallets/${walletId}/settings`;

            await doApiCall(url, "put", { [preferenceName]: preferenceValue }, 204, "Failed to save preference");
        } catch (e) {
            improveAndRethrow(e, "saveUserSetting");
        }
    }

    /**
     * Retrieves account data or null if failed to authenticate
     *
     * @param walletId {string} id of wallet to get data for
     * @param [doNotNotifyForNoSession=false] {boolean} whether to notify app about missing session for request requiring session
     * @return {Promise<UserDataAndSettings|null>}
     *         null means forbidden error
     */
    static async getAccountData(walletId, doNotNotifyForNoSession = false) {
        try {
            const url = `${urlWithPrefix}/wallets/${walletId}`;

            const result = await doApiCall(url, "get", null, 200, "", {
                doPostEventOnNotAuthenticated: doNotNotifyForNoSession,
            });
            const settingValues = UserDataAndSettings.getAllSettings().map(
                setting => new UserSettingValue(setting, (result?.settings ?? {})[setting.name])
            );
            return new UserDataAndSettings(result.creationTime, result.lastPasswordChangeDate, settingValues);
        } catch (e) {
            if (e instanceof ApiCallWrongResponseError && e.isForbiddenError()) {
                return null;
            }
            improveAndRethrow(e, "getAccountData");
        }
    }
}
