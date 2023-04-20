export class UserSetting {
    static PREFERENCES_TYPES = {
        FLAG: "flag",
    };

    /**
     * @param name {string}
     * @param defaultValue {any}
     * @param preferenceType {string|null} one of PREFERENCES_TYPES, indicates that this setting can be shown in UI
     *        as control with corresponding type
     */
    constructor(name, defaultValue = null, preferenceType = null) {
        this.name = name;
        this.defaultValue = defaultValue;
        this.preferenceType = preferenceType;
    }
}

export class UserSettingValue {
    /**
     * @param setting {UserSetting}
     * @param value {any}
     */
    constructor(setting, value) {
        this.setting = setting;
        this.value = value ?? setting.defaultValue;
    }
}

export class UserDataAndSettings {
    /**
     * @param creationTime {number}
     * @param lastPasswordChangeDate {number}
     * @param settings {UserSettingValue[]}
     */
    constructor(creationTime, lastPasswordChangeDate, settings) {
        this.creationTime = creationTime;
        this.lastPasswordChangeDate = lastPasswordChangeDate;
        this.settings = settings;
    }

    static SETTINGS = {
        SHOW_FEE_RATES: new UserSetting("showFeeRates", true, UserSetting.PREFERENCES_TYPES.FLAG),
        DONT_REMOVE_CLIENT_LOGS_WHEN_SIGNED_OUT: new UserSetting(
            "doNotRemoveClientLogsWhenSignedOut",
            false,
            UserSetting.PREFERENCES_TYPES.FLAG
        ),
        ENABLED_COINS_LIST: new UserSetting("enabledCoinsList"),
        CURRENCY_CODE: new UserSetting("currencyCode"),
        ADDRESSES_TYPE: new UserSetting("addressesType"),
        LAST_NOTIFICATIONS_VIEW_TIMESTAMP: new UserSetting("lastNotificationsViewTimestamp"),
    };

    /**
     * @return {UserSetting[]}
     */
    static getAllSettings() {
        return Object.values(this.SETTINGS);
    }

    static getSettingByName(name) {
        return Object.values(this.SETTINGS).find(s => s.name === name);
    }
}
