import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { getWalletId } from "../../../common/services/internal/storage";
import { Logger } from "../../../support/services/internal/logs/logger";
import { CURRENT_PREFERENCES_EVENT, EventBus } from "../../../common/adapters/eventbus";
import { WalletDataApi } from "../backend-api/walletDataApi";

/**
 * Manages preferences of the wallet (like UI preferences)
 */
export class PreferencesService {
    /**
     * Supported types of preferences
     */
    static PREFERENCES_TYPES = {
        FLAG: "flag",
    };

    /**
     * Supported preferences metadata
     */
    static PREFERENCES = {
        SHOW_FEE_RATES: {
            name: "showFeeRates",
            type: this.PREFERENCES_TYPES.FLAG,
            default: true,
        },
        DONT_REMOVE_CLIENT_LOGS_WHEN_SIGNED_OUT: {
            name: "doNotRemoveClientLogsWhenSignedOut",
            type: this.PREFERENCES_TYPES.FLAG,
            default: false,
        },
    };

    /**
     * Updates value of preference by name
     *
     * @param name {string} name, should be one of the PREFERENCES.name
     * @param value {string} value of the preference to be saved
     * @return {Promise<void>}
     */
    static async updatePreferenceValue(name, value) {
        const loggerSource = "updatePreferenceValue";
        try {
            Logger.log(`Saving ${name}->${value}`, loggerSource);

            await WalletDataApi.savePreference(getWalletId(), name, "" + value);

            EventBus.dispatch(CURRENT_PREFERENCES_EVENT, null, { name: name, value: value });

            Logger.log(`Saved ${name}->${value}`, loggerSource);
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Retrieves value of a specific preference
     *
     * @param preferenceMetadata {Object} one of this.PREFERENCES objects
     * @return {Promise<*>} resolves to value of given preference or to default value if it is not found
     */
    static async getPreferenceValue(preferenceMetadata) {
        try {
            const preferences = await retrievePreferencesValues();

            EventBus.dispatch(CURRENT_PREFERENCES_EVENT, null, preferences);

            Logger.log(`Got ${JSON.stringify(preferences)}. Asked: ${preferenceMetadata.name}`, "getPreferenceValue");

            return preferences.find(preference => preference.name === preferenceMetadata.name)?.value;
        } catch (e) {
            improveAndRethrow(e, "getPreferenceValue");
        }
    }

    /**
     * Retrieves all values of preferences
     *
     * @return {Promise<{name: *, type: *, value: *}[]>} returns array of preferences data objects { name: string, value: *, type: string }
     */
    static async getPreferencesValues() {
        try {
            const preferences = await retrievePreferencesValues();

            EventBus.dispatch(CURRENT_PREFERENCES_EVENT, null, preferences);

            Logger.log(`Got ${JSON.stringify(preferences)}`, "getPreferencesValues");

            return preferences;
        } catch (e) {
            improveAndRethrow(e, "getPreferencesValues");
        }
    }
}

async function retrievePreferencesValues() {
    try {
        const walletData = await WalletDataApi.getWalletData(getWalletId());

        const settings = walletData?.settings ?? {};
        return Object.keys(PreferencesService.PREFERENCES).map(key => {
            const preference = PreferencesService.PREFERENCES[key];
            let value;

            if (settings.hasOwnProperty(preference.name)) {
                switch (preference.type) {
                    case PreferencesService.PREFERENCES_TYPES.FLAG:
                        value = settings[preference.name] === "true" || settings[preference.name] === true;
                        break;
                    default:
                        value = settings[preference.name];
                }
            } else {
                value = preference.default;
            }

            return {
                name: preference.name,
                value: value,
                type: preference.type,
            };
        });
    } catch (e) {
        improveAndRethrow(e, "retrievePreferencesValues");
    }
}
