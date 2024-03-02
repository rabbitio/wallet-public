import { AccountsData } from "../../../wallet/btc/lib/accounts.js";
import { WORK_ON_BLOCKCHAIN_NETWORKS_OF_TYPE, IS_TESTING } from "../../../../properties.js";
import { Coins } from "../../../wallet/coins.js";
import { Network } from "../../../wallet/common/models/networks.js";

// TODO: [refactoring, low] Upgrade this logic according to new domains-based code structure
let storageProvider = !IS_TESTING && localStorage;
const MAX_LOCAL_STORAGE_VOLUME_BYTES = 5 * 1024 * 1024;
const MAX_LOGS_STORAGE_BYTES = MAX_LOCAL_STORAGE_VOLUME_BYTES * 0.65;

export function setStorageProvider(provider) {
    storageProvider = provider;
}

export class Storage {
    static saveEncryptedWalletCredentials(encryptedMnemonic, encryptedPassphrase) {
        storageProvider.setItem("encryptedMnemonic", encryptedMnemonic);
        storageProvider.setItem("encryptedPassphrase", encryptedPassphrase);
    }

    /**
     * @returns Object { encryptedMnemonic: string, encryptedPassphrase: string } or null if at least one of them is not set
     */
    static getEncryptedWalletCredentials() {
        const encryptedMnemonic = storageProvider.getItem("encryptedMnemonic");
        const encryptedPassphrase = storageProvider.getItem("encryptedPassphrase");
        if (encryptedMnemonic != null && encryptedPassphrase != null) {
            return {
                encryptedMnemonic,
                encryptedPassphrase,
            };
        }

        return null;
    }

    static saveWalletId(walletId) {
        storageProvider.setItem("walletId", walletId);
    }

    static getWalletId() {
        return storageProvider.getItem("walletId");
    }

    static saveDataPassword(password) {
        storageProvider.setItem("dataPassword", password);
    }

    static getDataPassword() {
        return storageProvider.getItem("dataPassword");
    }

    static clearDataPassword() {
        storageProvider.removeItem("dataPassword");
    }

    static saveCurrentIpHash(ipHash) {
        storageProvider.setItem("currentIpHash", ipHash);
    }

    static getCurrentIpHash() {
        return storageProvider.getItem("currentIpHash");
    }

    static getAccountsData() {
        const serializedAccountsData = storageProvider.getItem("accountsData");
        return (serializedAccountsData && new AccountsData(serializedAccountsData)) || null;
    }

    static saveAccountsData(accountsData) {
        if (accountsData instanceof AccountsData) {
            storageProvider.setItem("accountsData", accountsData.serialize());
        } else {
            throw new Error("Cannot save accounts data of wrong type. ");
        }
    }

    static clearAccountsData() {
        storageProvider.removeItem("accountsData");
    }

    static saveCurrentNetwork(newNetwork) {
        if (newNetwork === "main" || newNetwork === "test") {
            storageProvider.setItem("network", newNetwork);
        } else if (newNetwork instanceof Network) {
            if (Coins.getSupportedCoinsList().find(coin => coin.mainnet === newNetwork)) {
                storageProvider.setItem("network", "main");
            } else {
                storageProvider.setItem("network", "test");
            }
        } else {
            throw new Error(
                "saveCurrentNetwork: Network parameter is not 'main' or 'test' and not the Network object: " + newNetwork
            );
        }
    }

    /**
     * Retrieves saved network or saves network and returns according to application properties
     *
     * @param coin {Coin} coin to get network for
     * @returns {Network} network in given coin
     */
    static getCurrentNetwork(coin = Coins.COINS.BTC) {
        let networkType = storageProvider.getItem("network");
        if (!networkType) {
            networkType = WORK_ON_BLOCKCHAIN_NETWORKS_OF_TYPE;
            storageProvider.setItem("network", WORK_ON_BLOCKCHAIN_NETWORKS_OF_TYPE);
        }

        if (networkType === "main") {
            return coin.mainnet;
        } else if (networkType === "test") {
            return coin.testnet;
        } else {
            storageProvider.setItem("network", WORK_ON_BLOCKCHAIN_NETWORKS_OF_TYPE);
            return WORK_ON_BLOCKCHAIN_NETWORKS_OF_TYPE === "main" ? coin.mainnet : coin.testnet;
        }
    }

    static clearScanAddressesFlag() {
        const flag = storageProvider.getItem("scanAddressesFlag");
        storageProvider.removeItem("scanAddressesFlag");
        return flag;
    }

    static clearStorage() {
        let keysThatShouldNotBeRemoved = [
            "doNotRemoveClientLogsWhenSignedOut",
            Storage.getDoNotRemoveClientLogsWhenSignedOut() === "true" ? "clientLogs" : [],
        ].flat();

        keysThatShouldNotBeRemoved = keysThatShouldNotBeRemoved.map(item => ({
            key: item,
            value: storageProvider.getItem(item),
        }));
        storageProvider.clear();
        for (let i = 0; i < keysThatShouldNotBeRemoved.length; ++i) {
            storageProvider.setItem(keysThatShouldNotBeRemoved[i].key, keysThatShouldNotBeRemoved[i].value);
        }
    }

    static saveFeeRates(serializedFeeRatesArray) {
        storageProvider.setItem("feeRatesArray", serializedFeeRatesArray);
    }

    static saveFeeRatesExpirationTime(expirationTime) {
        storageProvider.setItem("feeExpirationTime", expirationTime);
    }

    static getSerializedFeeRatesArray() {
        return storageProvider.getItem("feeRatesArray");
    }

    static getFeeRatesExpirationTime() {
        return storageProvider.getItem("feeExpirationTime");
    }

    static saveShownNotificationPushesCount(shownNotificationPushesCount, walletId) {
        const walletIdPart = walletId.slice(0, 8);
        storageProvider.setItem("shownNotificationPushesCount_" + walletIdPart, shownNotificationPushesCount);
    }

    static getShownNotificationPushesCount(walletId) {
        const walletIdPart = walletId.slice(0, 8);
        return storageProvider.getItem("shownNotificationPushesCount_" + walletIdPart);
    }

    static saveIsNotFoundSessionMessageShownForLastLostSession(value) {
        storageProvider.setItem("isNotFoundSessionMessageShownForLastLostSession", value);
    }

    static getIsNotFoundSessionMessageShownForLastLostSession() {
        return storageProvider.getItem("isNotFoundSessionMessageShownForLastLostSession") === "true";
    }

    static saveIsPassphraseUsed(walletId, flag) {
        const isPassphraseUsedMap = JSON.parse(storageProvider.getItem("isPassphraseUsed") || "{}");
        storageProvider.setItem("isPassphraseUsed", JSON.stringify({ ...isPassphraseUsedMap, [walletId]: flag }));
    }

    static getIsPassphraseUsed(walletId) {
        const isPassphraseUsedMap = JSON.parse(storageProvider.getItem("isPassphraseUsed") || "{}");
        return isPassphraseUsedMap[walletId];
    }

    static saveLogs(logsString) {
        const lettersCountToRemove = logsString.length - Math.round(MAX_LOGS_STORAGE_BYTES / 2);
        if (lettersCountToRemove > 0) {
            storageProvider.setItem("clientLogs", logsString.slice(lettersCountToRemove, logsString.length));
        } else {
            storageProvider.setItem("clientLogs", logsString);
        }
    }

    static getLogs() {
        return storageProvider.getItem("clientLogs");
    }

    static removeLogs() {
        return storageProvider.removeItem("clientLogs");
    }

    static getDoNotRemoveClientLogsWhenSignedOut() {
        return storageProvider.getItem("doNotRemoveClientLogsWhenSignedOut");
    }

    static setDoNotRemoveClientLogsWhenSignedOut(value) {
        storageProvider.setItem("doNotRemoveClientLogsWhenSignedOut", value);
    }

    static getPersistentCacheItem(uniqueKey) {
        return storageProvider.getItem(uniqueKey);
    }

    static setPersistentCacheItem(uniqueKey, value) {
        storageProvider.setItem(uniqueKey, value);
    }

    static getSwapIds() {
        return storageProvider.getItem("publicSwapIds");
    }

    static setSwapIds(value) {
        storageProvider.setItem("publicSwapIds", value);
    }
}
