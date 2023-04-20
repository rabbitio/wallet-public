import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { getWalletId } from "../../../common/services/internal/storage";
import { Logger } from "../../../support/services/internal/logs/logger";
import { CURRENT_PREFERENCES_EVENT, EventBus } from "../../../common/adapters/eventbus";
import { WalletDataApi } from "../backend-api/walletDataApi";
import { cache } from "../../../common/utils/cache";
import { UserDataAndSettings, UserSetting, UserSettingValue } from "../models/userDataAndSettings";

/**
 * Manages account data of the wallet (like UI preferences or enabled coins list)
 */
// TODO: [refactoring, moderate] rename to UserDataAndSettingsService
export class PreferencesService {
    static _CACHE_KEY = "walletDataCache_kf34sdkp21";

    /**
     * Retrieves all values of preferences
     *
     * @return {{name: string, type: string, value: any}[]}
     */
    static getPreferencesValues() {
        try {
            const cachedSettings = cache.get(this._CACHE_KEY)?.settings ?? [];
            const preferences = UserDataAndSettings.getAllSettings().filter(s => s.preferenceType);
            return preferences.map(preference => {
                let value;
                const cachedSettingValue =
                    cachedSettings.find(s => s?.setting === preference)?.value ?? preference.defaultValue;
                switch (preference.preferenceType) {
                    case UserSetting.PREFERENCES_TYPES.FLAG:
                        value = cachedSettingValue === "true" || cachedSettingValue === true;
                        break;
                    default:
                        value = cachedSettingValue;
                }
                return {
                    name: preference.name,
                    value: value,
                    type: preference.preferenceType,
                };
            });
        } catch (e) {
            improveAndRethrow(e, "getPreferencesValues");
        }
    }

    /**
     * IMPORTANT: should be called when user sings into wallet or initializes app having an active
     * session on client. This helps to avoid retrieving the same data many times from server.
     * Also, some services used when the session is active require this data.
     *
     * @param walletData {UserDataAndSettings}
     * @return {void}
     */
    static cacheWalletData(walletData) {
        try {
            cache.putSessionDependentData(this._CACHE_KEY, walletData);
        } catch (e) {
            improveAndRethrow(e, "cacheWalletData");
        }
    }

    /**
     * @return {number|undefined}
     */
    static getWalletCreationTime() {
        return cache.get(this._CACHE_KEY)?.creationTime;
    }

    /**
     * @return {number|undefined}
     */
    static getLastPasswordChangeTimestamp() {
        const userdataCache = cache.get(this._CACHE_KEY);
        return userdataCache?.lastPasswordChangeDate || userdataCache?.creationTime;
    }

    static cacheLastPasswordChangeTimestamp(timestamp) {
        const current = cache.get(this._CACHE_KEY);
        cache.put(this._CACHE_KEY, { ...current, lastPasswordChangeDate: timestamp });
    }

    /**
     * @param setting {UserSetting}
     * @return {any}
     */
    static getUserSettingValue(setting) {
        try {
            const settingsList = cache.get(this._CACHE_KEY)?.settings;
            return (
                (settingsList ?? []).find(settingValue => settingValue?.setting === setting)?.value ??
                setting.defaultValue
            );
        } catch (e) {
            improveAndRethrow(e, "getSettingValue");
        }
    }

    /**
     * Updates value of wallet setting. Puts value if it is not present in the list
     *
     * @param setting {UserSetting} use UserDataAndSettings.SETTINGS
     * @param value {string} value of the setting to be saved
     * @return {Promise<void>}
     */
    static async cacheAndSaveSetting(setting, value) {
        const loggerSource = "cacheAndSaveSetting";
        try {
            Logger.log(`Saving ${setting.name}->${value}`, loggerSource);

            const currentUserData = cache.get(this._CACHE_KEY) ?? {};
            !currentUserData?.settings && (currentUserData.settings = []);
            let settingValue = currentUserData.settings.find(s => s?.setting?.name === setting.name);
            if (!settingValue) {
                currentUserData.settings.push(new UserSettingValue(setting, value));
            } else {
                settingValue.value = value;
            }
            cache.put(this._CACHE_KEY, currentUserData);

            await WalletDataApi.saveUserSetting(getWalletId(), setting.name, "" + value);

            EventBus.dispatch(CURRENT_PREFERENCES_EVENT, null, currentUserData.settings);
            Logger.log(`Saved ${setting.name}->${value}`, loggerSource);
        } catch (e) {
            improveAndRethrow(e, "cacheAndSaveSetting");
        }
    }

    static scheduleWalletDataSynchronization() {
        this._walletDataSyncIntervalId = setInterval(async () => {
            try {
                const accountData = await WalletDataApi.getAccountData(getWalletId());
                cache.put(this._CACHE_KEY, accountData);
                EventBus.dispatch(CURRENT_PREFERENCES_EVENT, null, accountData.settings);
            } catch (e) {
                improveAndRethrow(e, "walletDataSyncInterval");
            }
        }, 600_000);
    }

    static removeWalletDataSyncInterval() {
        this._walletDataSyncIntervalId && clearInterval(this._walletDataSyncIntervalId);
    }
}
