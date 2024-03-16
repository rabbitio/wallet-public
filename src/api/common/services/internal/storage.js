import { AccountsData } from "../../../wallet/btc/lib/accounts.js";
import { WORK_ON_BLOCKCHAIN_NETWORKS_OF_TYPE, IS_TESTING } from "../../../../properties.js";
import { Coins } from "../../../wallet/coins.js";
import { Network } from "../../../wallet/common/models/networks.js";

// TODO: [refactoring, low] Upgrade this logic according to new domains-based code structure
let storageProvider = !IS_TESTING && localStorage;

export function setStorageProvider(provider) {
    storageProvider = provider;
}

export class Storage {
    static KEYS = {
        encryptedMnemonic: "encryptedMnemonic",
        encryptedPassphrase: "encryptedPassphrase",
        walletId: "walletId",
        dataPassword: "dataPassword",
        currentIpHash: "currentIpHash",
        accountsData: "accountsData",
        network: "network",
        scanAddressesFlag: "scanAddressesFlag",
        feeRatesArray: "feeRatesArray",
        feeExpirationTime: "feeExpirationTime",
        isNotFoundSessionMessageShownForLastLostSession: "isNotFoundSessionMessageShownForLastLostSession",
        isPassphraseUsed: "isPassphraseUsed",
        doNotRemoveClientLogsWhenSignedOut: "doNotRemoveClientLogsWhenSignedOut",
    };

    static saveEncryptedWalletCredentials(encryptedMnemonic, encryptedPassphrase) {
        storageProvider.setItem(this.KEYS.encryptedMnemonic, encryptedMnemonic);
        storageProvider.setItem(this.KEYS.encryptedPassphrase, encryptedPassphrase);
    }

    /**
     * @returns Object { encryptedMnemonic: string, encryptedPassphrase: string } or null if at least one of them is not set
     */
    static getEncryptedWalletCredentials() {
        const encryptedMnemonic = storageProvider.getItem(this.KEYS.encryptedMnemonic);
        const encryptedPassphrase = storageProvider.getItem(this.KEYS.encryptedPassphrase);
        if (encryptedMnemonic != null && encryptedPassphrase != null) {
            return {
                encryptedMnemonic,
                encryptedPassphrase,
            };
        }

        return null;
    }

    static saveWalletId(walletId) {
        storageProvider.setItem(this.KEYS.walletId, walletId);
    }

    static getWalletId() {
        return storageProvider.getItem(this.KEYS.walletId);
    }

    static saveDataPassword(password) {
        storageProvider.setItem(this.KEYS.dataPassword, password);
    }

    static getDataPassword() {
        return storageProvider.getItem(this.KEYS.dataPassword);
    }

    static clearDataPassword() {
        storageProvider.removeItem(this.KEYS.dataPassword);
    }

    static saveCurrentIpHash(ipHash) {
        storageProvider.setItem(this.KEYS.currentIpHash, ipHash);
    }

    static getCurrentIpHash() {
        return storageProvider.getItem(this.KEYS.currentIpHash);
    }

    static getAccountsData() {
        const serializedAccountsData = storageProvider.getItem(this.KEYS.accountsData);
        return (serializedAccountsData && new AccountsData(serializedAccountsData)) || null;
    }

    static saveAccountsData(accountsData) {
        if (accountsData instanceof AccountsData) {
            storageProvider.setItem(this.KEYS.accountsData, accountsData.serialize());
        } else {
            throw new Error("Cannot save accounts data of wrong type. ");
        }
    }

    static clearAccountsData() {
        storageProvider.removeItem(this.KEYS.accountsData);
    }

    static saveCurrentNetwork(newNetwork) {
        if (newNetwork === "main" || newNetwork === "test") {
            storageProvider.setItem(this.KEYS.network, newNetwork);
        } else if (newNetwork instanceof Network) {
            if (Coins.getSupportedCoinsList().find(coin => coin.mainnet === newNetwork)) {
                storageProvider.setItem(this.KEYS.network, "main");
            } else {
                storageProvider.setItem(this.KEYS.network, "test");
            }
        } else {
            throw new Error(
                "saveCurrentNetwork: Network parameter is not 'main' or 'test' and not the Network object: " +
                    newNetwork
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
        let networkType = storageProvider.getItem(this.KEYS.network);
        if (!networkType) {
            networkType = WORK_ON_BLOCKCHAIN_NETWORKS_OF_TYPE;
            storageProvider.setItem(this.KEYS.network, WORK_ON_BLOCKCHAIN_NETWORKS_OF_TYPE);
        }

        if (networkType === "main") {
            return coin.mainnet;
        } else if (networkType === "test") {
            return coin.testnet;
        } else {
            storageProvider.setItem(this.KEYS.network, WORK_ON_BLOCKCHAIN_NETWORKS_OF_TYPE);
            return WORK_ON_BLOCKCHAIN_NETWORKS_OF_TYPE === "main" ? coin.mainnet : coin.testnet;
        }
    }

    static clearScanAddressesFlag() {
        const flag = storageProvider.getItem(this.KEYS.scanAddressesFlag);
        storageProvider.removeItem(this.KEYS.scanAddressesFlag);
        return flag;
    }

    static clearStorage() {
        for (let key of Object.keys(this.KEYS)) {
            storageProvider.removeItem(key);
        }
    }

    static saveFeeRates(serializedFeeRatesArray) {
        storageProvider.setItem(this.KEYS.feeRatesArray, serializedFeeRatesArray);
    }

    static saveFeeRatesExpirationTime(expirationTime) {
        storageProvider.setItem(this.KEYS.feeExpirationTime, expirationTime);
    }

    static getSerializedFeeRatesArray() {
        return storageProvider.getItem(this.KEYS.feeRatesArray);
    }

    static getFeeRatesExpirationTime() {
        return storageProvider.getItem(this.KEYS.feeExpirationTime);
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
        storageProvider.setItem(this.KEYS.isNotFoundSessionMessageShownForLastLostSession, value);
    }

    static getIsNotFoundSessionMessageShownForLastLostSession() {
        return storageProvider.getItem(this.KEYS.isNotFoundSessionMessageShownForLastLostSession) === "true";
    }

    static saveIsPassphraseUsed(walletId, flag) {
        const isPassphraseUsedMap = JSON.parse(storageProvider.getItem(this.KEYS.isPassphraseUsed) || "{}");
        storageProvider.setItem(
            this.KEYS.isPassphraseUsed,
            JSON.stringify({ ...isPassphraseUsedMap, [walletId]: flag })
        );
    }

    static getIsPassphraseUsed(walletId) {
        const isPassphraseUsedMap = JSON.parse(storageProvider.getItem(this.KEYS.isPassphraseUsed) || "{}");
        return isPassphraseUsedMap[walletId];
    }
}
