import { AccountsData } from "../../../wallet/btc/lib/accounts";
import { WORK_ON_BLOCKCHAIN_NETWORKS_OF_TYPE, IS_TESTING } from "../../../../properties";
import { Coins } from "../../../wallet/coins";
import { Network } from "../../../wallet/common/models/networks";

// TODO: [refactoring, low] Make as class
// TODO: [refactoring, low] Upgrade this logic according to new domains-based code structure
let storageProvider = !IS_TESTING && localStorage;
const MAX_LOCAL_STORAGE_VOLUME_BYTES = 5 * 1024 * 1024;
const MAX_LOGS_STORAGE_BYTES = MAX_LOCAL_STORAGE_VOLUME_BYTES * 0.65;

export function setStorageProvider(provider) {
    storageProvider = provider;
}

export function saveEncryptedWalletCredentials(encryptedMnemonic, encryptedPassphrase) {
    storageProvider.setItem("encryptedMnemonic", encryptedMnemonic);
    storageProvider.setItem("encryptedPassphrase", encryptedPassphrase);
}

/**
 * @returns Object { encryptedMnemonic: string, encryptedPassphrase: string } or null if at least one of them is not set
 */
export function getEncryptedWalletCredentials() {
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

export function saveWalletId(walletId) {
    storageProvider.setItem("walletId", walletId);
}

export function getWalletId() {
    return storageProvider.getItem("walletId");
}

export function saveDataPassword(password) {
    storageProvider.setItem("dataPassword", password);
}

export function getDataPassword() {
    return storageProvider.getItem("dataPassword");
}

export function clearDataPassword() {
    storageProvider.removeItem("dataPassword");
}

export function saveCurrentIpHash(ipHash) {
    storageProvider.setItem("currentIpHash", ipHash);
}

export function getCurrentIpHash() {
    return storageProvider.getItem("currentIpHash");
}

export function getAccountsData() {
    const serializedAccountsData = storageProvider.getItem("accountsData");
    return (serializedAccountsData && new AccountsData(serializedAccountsData)) || null;
}

export function saveAccountsData(accountsData) {
    if (accountsData instanceof AccountsData) {
        storageProvider.setItem("accountsData", accountsData.serialize());
    } else {
        throw new Error("Cannot save accounts data of wrong type. ");
    }
}

export function clearAccountsData() {
    storageProvider.removeItem("accountsData");
}

export function saveCurrentNetwork(newNetwork) {
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
export function getCurrentNetwork(coin = Coins.COINS.BTC) {
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

export function clearScanAddressesFlag() {
    const flag = storageProvider.getItem("scanAddressesFlag");
    storageProvider.removeItem("scanAddressesFlag");
    return flag;
}

export function clearStorage() {
    let keysThatShouldNotBeRemoved = [
        "doNotRemoveClientLogsWhenSignedOut",
        getDoNotRemoveClientLogsWhenSignedOut() === "true" ? "clientLogs" : [],
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

export function saveFeeRates(serializedFeeRatesArray) {
    storageProvider.setItem("feeRatesArray", serializedFeeRatesArray);
}

export function saveFeeRatesExpirationTime(expirationTime) {
    storageProvider.setItem("feeExpirationTime", expirationTime);
}

export function getSerializedFeeRatesArray() {
    return storageProvider.getItem("feeRatesArray");
}

export function getFeeRatesExpirationTime() {
    return storageProvider.getItem("feeExpirationTime");
}

export function saveShownNotificationPushesCount(shownNotificationPushesCount, walletId) {
    const walletIdPart = walletId.slice(0, 8);
    storageProvider.setItem("shownNotificationPushesCount_" + walletIdPart, shownNotificationPushesCount);
}

export function getShownNotificationPushesCount(walletId) {
    const walletIdPart = walletId.slice(0, 8);
    return storageProvider.getItem("shownNotificationPushesCount_" + walletIdPart);
}

export function saveIsNotFoundSessionMessageShownForLastLostSession(value) {
    storageProvider.setItem("isNotFoundSessionMessageShownForLastLostSession", value);
}

export function getIsNotFoundSessionMessageShownForLastLostSession() {
    return storageProvider.getItem("isNotFoundSessionMessageShownForLastLostSession") === "true";
}

export function saveIsPassphraseUsed(walletId, flag) {
    const isPassphraseUsedMap = JSON.parse(storageProvider.getItem("isPassphraseUsed") || "{}");
    storageProvider.setItem("isPassphraseUsed", JSON.stringify({ ...isPassphraseUsedMap, [walletId]: flag }));
}

export function getIsPassphraseUsed(walletId) {
    const isPassphraseUsedMap = JSON.parse(storageProvider.getItem("isPassphraseUsed") || "{}");
    return isPassphraseUsedMap[walletId];
}

export function saveLogs(logsString) {
    const lettersCountToRemove = logsString.length - Math.round(MAX_LOGS_STORAGE_BYTES / 2);
    if (lettersCountToRemove > 0) {
        storageProvider.setItem("clientLogs", logsString.slice(lettersCountToRemove, logsString.length));
    } else {
        storageProvider.setItem("clientLogs", logsString);
    }
}

export function getLogs() {
    return storageProvider.getItem("clientLogs");
}

export function removeLogs() {
    return storageProvider.removeItem("clientLogs");
}

export function getDoNotRemoveClientLogsWhenSignedOut() {
    return storageProvider.getItem("doNotRemoveClientLogsWhenSignedOut");
}

export function setDoNotRemoveClientLogsWhenSignedOut(value) {
    storageProvider.setItem("doNotRemoveClientLogsWhenSignedOut", value);
}

export function getPersistentCacheItem(uniqueKey) {
    return storageProvider.getItem(uniqueKey);
}

export function setPersistentCacheItem(uniqueKey, value) {
    storageProvider.setItem(uniqueKey, value);
}

export function getSwapIds() {
    return storageProvider.getItem("publicSwapIds");
}

export function setSwapIds(value) {
    storageProvider.setItem("publicSwapIds", value);
}
