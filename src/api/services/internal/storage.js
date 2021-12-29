import { mainnet, testnet } from "../../lib/networks";
import { AccountsData } from "../../lib/accounts";
import { BTC_NETWORK_KEY, IS_TESTING } from "../../../properties";

// TODO: [refactoring, moderate] Make as class
let storageProvider = !IS_TESTING && localStorage;

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

// TODO: [refactoring, moderate] Remove satoshis logic
export function isSatoshiModeEnabled() {
    const value = storageProvider.getItem("enableSatoshi");
    return value === "checked";
}

export function saveSatoshiModeState(isEnabled) {
    storageProvider.setItem("enableSatoshi", isEnabled ? "checked" : "not_checked");
}

export function saveCurrentNetwork(newNetwork) {
    storageProvider.setItem("network", newNetwork.key);
}

export function getCurrentNetwork() {
    let networkKey = storageProvider.getItem("network");
    if (!networkKey) {
        networkKey = BTC_NETWORK_KEY;
        storageProvider.setItem("network", BTC_NETWORK_KEY);
    }

    if (networkKey === mainnet.key) {
        return mainnet;
    }

    return testnet;
}

export function clearScanAddressesFlag() {
    const flag = storageProvider.getItem("scanAddressesFlag");
    storageProvider.removeItem("scanAddressesFlag");
    return flag;
}

export function clearStorage() {
    storageProvider.clear();
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

export function saveShownNotificationPushesCount(shownNotificationPushesCount) {
    storageProvider.setItem("shownNotificationPushesCount", shownNotificationPushesCount);
}

export function getShownNotificationPushesCount() {
    return storageProvider.getItem("shownNotificationPushesCount");
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
