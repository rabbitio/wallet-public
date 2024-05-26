import { v4 } from "uuid";

import { improveAndRethrow, Logger, CacheAndConcurrentRequestsResolver } from "@rabbitio/ui-kit";

import { Storage } from "../../../common/services/internal/storage.js";
import { hasMinConfirmations } from "../lib/transactions/transactions-utils.js";
import {
    CHANGE_SCHEME,
    EXTERNAL_CHANGE_INDEX,
    EXTERNAL_SCHEME,
    getExternalAddressPath,
    BitcoinAddresses,
    INTERNAL_CHANGE_INDEX,
    LEGACY_SCHEME,
} from "../lib/addresses.js";
import Address from "../../common/models/address.js";
import CurrentAddressUtils from "./utils/currentAddressUtils.js";
import AddressesDataApi from "../../common/backend-api/addressesDataApi.js";
import AddressesDataAdapter from "../../common/backend-api/adapters/addressesDataAdapter.js";
import { transactionsDataProvider } from "./internal/transactionsDataProvider.js";
import { EventBus, NEW_ADDRESS_CREATED_EVENT } from "../../../common/adapters/eventbus.js";
import { PreferencesService } from "../../common/services/preferencesService.js";
import { UserDataAndSettings } from "../../common/models/userDataAndSettings.js";
import { MODERATE_TTL_FOR_RELATIVELY_FREQ_CHANGING_DATA_MS } from "../../../common/utils/ttlConstants.js";
import { cache } from "../../../common/utils/cache.js";

// TODO: [refactoring, moderate] remove redundant addresses related logic from this class task_id=2dfd7adefe9d48acbe0ecb6f83fd68f7
export default class AddressesService {
    static _cacheKeyPart = "7712d7db-46d4-4f68-8462-60944a26433e";
    static _calcExternalAddressCacheKey(addressesType) {
        return `${addressesType}_${this._cacheKeyPart}`;
    }

    // TODO: [refactoring, moderate] Since 0.8.3 we don't support new addresses creation so looks like this addresses resolver can be removed. task_id=546c83e7f4b64f39b67055a7c4ecaa48
    // TODO: [tests, moderate] add units for caching for existing tests
    static _addressResolver = new CacheAndConcurrentRequestsResolver(
        "externalAddress",
        cache,
        MODERATE_TTL_FOR_RELATIVELY_FREQ_CHANGING_DATA_MS,
        false
    );

    static invalidateCaches() {
        this._addressResolver.invalidateContaining(this._cacheKeyPart);
    }

    // TODO: [tests, moderate] unit tests
    /**
     * Retrieves confirmed transactions sending to the provided addresses.
     *
     * @param addresses {string[]}
     * @return {Promise<Transaction[]>}
     */
    static async getConfirmedTransactionsSendingToAddresses(addresses) {
        try {
            const allTransactions = await transactionsDataProvider.getTransactionsByAddresses(addresses);

            return allTransactions.filter(transaction => hasMinConfirmations(transaction));
        } catch (e) {
            improveAndRethrow(e, "getConfirmedTransactionsSendingToAddresses");
        }
    }

    /**
     * Creates new external address
     *
     * @param [label] {string} optional label for address
     * @returns {Promise<{ uuid: string, address: string, label: string, creationTime: number }>}
     */
    static async createNewExternalAddress(label) {
        const loggerSource = "createNewExternalAddress";
        try {
            Logger.log("Start creating new external address", loggerSource);

            const addressType = this.getAddressesType();

            Logger.log(`Address type: ${addressType}`, loggerSource);

            const labelOrDefault = label || Address.labelAutogenerated;
            const scheme = this.SCHEMES_BY_ADDRESS_TYPE.get(addressType);
            const addressResult = await createAddressBySchemeAndIncrementValue(scheme, labelOrDefault);
            const creationTime = Date.now();
            this._addressResolver.actualizeCachedData(this._calcExternalAddressCacheKey(addressType), cached => ({
                isModified: true,
                data: addressResult.address,
            }));

            EventBus.dispatch(NEW_ADDRESS_CREATED_EVENT);

            Logger.log(`Address created: ${addressResult}`, loggerSource);
            return { ...addressResult, label: labelOrDefault, creationTime: creationTime };
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Creates initial data to be passed during wallet creation.
     *
     * @param accountsData {AccountsData} accounts data of wallet to generate initial data for
     * @param [password] {string} optional password for data encryption
     * @returns {{ initialIndexesData: { p: string, i: number}[], initialAddressesData: { h: string, encData: string }[] }}
     */
    static createInitialAddressesData(accountsData, password = Storage.getDataPassword()) {
        const loggerSource = "createInitialAddressesData";
        try {
            Logger.log(`Start creating initial addresses data`, loggerSource);

            const network = Storage.getCurrentNetwork();
            const { newAddress } = BitcoinAddresses.createNewExternalAddressByScheme(
                accountsData,
                network,
                [],
                EXTERNAL_SCHEME
            );
            const { newAddress: legacyAddress } = BitcoinAddresses.createNewExternalAddressByScheme(
                accountsData,
                network,
                [],
                LEGACY_SCHEME
            );

            this._addressResolver.actualizeCachedData(
                this._calcExternalAddressCacheKey(this.ADDRESSES_TYPES.SEGWIT),
                cached => ({ isModified: true, data: newAddress })
            );
            this._addressResolver.actualizeCachedData(
                this._calcExternalAddressCacheKey(this.ADDRESSES_TYPES.LEGACY),
                () => ({ isModified: true, data: legacyAddress })
            );

            const path = getExternalAddressPath(network, EXTERNAL_SCHEME);
            const legacyPath = getExternalAddressPath(network, LEGACY_SCHEME);
            const label = Address.labelAutogenerated;
            const encrypted = new Address(newAddress, label, +Date.now()).encryptAndSerialize(password);
            const legacyEnc = new Address(legacyAddress, label, +Date.now() + 1).encryptAndSerialize(password);

            Logger.log(`Data created: ${path}/0:${newAddress}, ${legacyPath}/0:${legacyAddress}`, loggerSource);

            return {
                initialIndexesData: [
                    AddressesDataAdapter.toServerFormatOfInitialIndexesData(path, 0)[0],
                    AddressesDataAdapter.toServerFormatOfInitialIndexesData(legacyPath, 0)[0],
                ],
                initialAddressesData: [
                    AddressesDataAdapter.toServerFormatOfInitialAddressesData(v4(), encrypted)[0],
                    AddressesDataAdapter.toServerFormatOfInitialAddressesData(v4(), legacyEnc)[0],
                ],
            };
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Updates address data

     * @param uuid {string} UUID of updating address
     * @param address {string} address to update data for
     * @param creationTime {number} creation time of address
     * @param newLabel {string|null} new label value
     * @return {Promise<void>}
     */
    // TODO: [refactoring, critical] Extract to base addresses service as it is not BTC-dependent
    static async updateAddressData(uuid, address, creationTime, newLabel) {
        const loggerSource = "updateAddressData";
        try {
            Logger.log(`Start updating addresses data ${address}: "${newLabel}"`, loggerSource);

            const newAddressData = new Address(address, newLabel, creationTime).encryptAndSerialize(
                Storage.getDataPassword()
            );
            const result = await AddressesDataApi.updateAddressData(Storage.getWalletId(), uuid, newAddressData);

            if (result === null) {
                Logger.log("Address not found, returning error", loggerSource);

                return {
                    result: false,
                    errorDescription: "We searched high and low but we couldn`t find the address on our server.",
                    howToFix: "If an address is removed, it cannot be updated.",
                };
            }

            Logger.log("Address updated", loggerSource);

            return { result: true };
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    static ADDRESSES_TYPES = {
        SEGWIT: "segwit",
        LEGACY: "legacy",
    };

    static SCHEMES_BY_ADDRESS_TYPE = new Map([
        [this.ADDRESSES_TYPES.SEGWIT, EXTERNAL_SCHEME],
        [this.ADDRESSES_TYPES.LEGACY, LEGACY_SCHEME],
    ]);

    /**
     * Saves desired addresses type to be used as default in the app
     *
     * @param addressesType - string
     * @return {Promise<void>}
     */
    static async saveAddressesType(addressesType) {
        const loggerSource = "saveAddressesType";
        try {
            Logger.log(`Start saving address type ${addressesType}`, loggerSource);

            if (addressesType !== this.ADDRESSES_TYPES.LEGACY && addressesType !== this.ADDRESSES_TYPES.SEGWIT) {
                throw new Error(`Wrong addresses type passed ${addressesType}`);
            }

            await PreferencesService.cacheAndSaveSetting(UserDataAndSettings.SETTINGS.ADDRESSES_TYPE, addressesType);

            Logger.log(`Address type selection saved ${addressesType}`, loggerSource);
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Returns addresses type stored on server. If addresses type is not stored returns SEGWIT type
     *
     * @return {string}
     */
    static getAddressesType() {
        try {
            const addressesType = PreferencesService.getUserSettingValue(UserDataAndSettings.SETTINGS.ADDRESSES_TYPE);
            return addressesType || this.ADDRESSES_TYPES.SEGWIT;
        } catch (e) {
            improveAndRethrow(e, "saveAddressesType");
        }
    }

    /**
     * Deletes address data from server.
     *
     * @param addressUUID - uuid of address to delete data for - should be not empty string
     * @returns Promise<void>
     */
    static async deleteAddressData(addressUUID) {
        const loggerSource = "deleteAddressData";
        try {
            Logger.log(`Start deleting address data ${addressUUID}`, loggerSource);

            if (typeof addressUUID !== "string" || addressUUID === "") {
                throw new Error("Address uuid should be not empty string. ");
            }

            await AddressesDataApi.deleteAddressData(Storage.getWalletId(), addressUUID);

            Logger.log(`Address data was removed ${addressUUID}`, loggerSource);
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Retrieves whole list of addresses data from server and returns decrypted data.
     *
     * @return {Promise<{ uuid: string, label: string, address: string, creationTime: number }[]>}
     */
    static async getAllAddressesData() {
        try {
            const list = await AddressesDataApi.getAddressesData(Storage.getWalletId());
            const dataPassword = Storage.getDataPassword();

            const currentNetwork = Storage.getCurrentNetwork();
            return list
                .map(addressDataItem => ({
                    ...Address.decryptAndDeserialize(addressDataItem.encryptedAddressData, dataPassword),
                    uuid: addressDataItem.uuid,
                }))
                .filter(
                    addressData => BitcoinAddresses.getNetworkByAddress(addressData.address).key === currentNetwork.key
                );
        } catch (e) {
            improveAndRethrow(e, "getAllAddressesData");
        }
    }

    /**
     * Retrieves current change address.
     *
     * Just calls getCurrentAddress for used change addresses scheme, default account index of given network and change
     * index of internal branch.
     *
     * @returns {Promise<string>} current BTC change address
     */
    static async getCurrentChangeAddress() {
        try {
            const network = Storage.getCurrentNetwork();
            return await CurrentAddressUtils._getCurrentAddress(
                Storage.getAccountsData(),
                network,
                Storage.getWalletId(),
                CHANGE_SCHEME,
                network.defaultAccountIndex,
                INTERNAL_CHANGE_INDEX
            );
        } catch (e) {
            improveAndRethrow(e, "getCurrentChangeAddress");
        }
    }

    /**
     * Retrieves current external address.
     *
     * Just calls getCurrentAddress for used external addresses scheme, default account index of given network and change
     * index of external branch.
     *
     * @returns {Promise<string>} promise resolving to address
     */
    static async getCurrentExternalAddress(type = null) {
        let result;
        let cacheKey;
        try {
            const addressType = type ?? this.getAddressesType();
            cacheKey = this._calcExternalAddressCacheKey(addressType);
            result = await this._addressResolver.getCachedOrWaitForCachedOrAcquireLock(cacheKey);
            if (!result?.canStartDataRetrieval) {
                return result?.cachedData;
            }

            const network = Storage.getCurrentNetwork();
            const scheme = this.SCHEMES_BY_ADDRESS_TYPE.get(addressType);

            const currentAddress = await CurrentAddressUtils._getCurrentAddress(
                Storage.getAccountsData(),
                network,
                Storage.getWalletId(),
                scheme,
                network.defaultAccountIndex,
                EXTERNAL_CHANGE_INDEX
            );
            this._addressResolver.saveCachedData(cacheKey, result?.lockId, currentAddress);
            return currentAddress;
        } catch (e) {
            improveAndRethrow(e, "getCurrentExternalAddress");
        } finally {
            this._addressResolver.releaseLock(cacheKey, result?.lockId);
        }
    }

    /**
     * Retrieves last addresses for provided parameters
     *
     * @param request {{ count: number, change: boolean, type: string }[]}
     *
     * @return {Promise<String[]>} Array of addresses
     */
    // TODO: [tests, moderate]
    static async getLastAddresses(request) {
        try {
            const indexes = await AddressesDataApi.getAddressesIndexes(Storage.getWalletId());
            const network = Storage.getCurrentNetwork();
            return request.reduce((prev, requestItem) => {
                const scheme = this.SCHEMES_BY_ADDRESS_TYPE.get(requestItem.type);

                const path = scheme.getChangeNodePath(
                    network.coinIndex,
                    network.defaultAccountIndex,
                    requestItem.change ? 1 : 0
                );
                const baseIndex = AddressesDataAdapter.getIndexByPath(indexes, path);
                const changeNode = scheme.deriveNeuteredChangeNodeForAccount(
                    Storage.getAccountsData(),
                    network,
                    network.defaultAccountIndex,
                    requestItem.change ? 1 : 0
                );

                for (let i = 0; i < requestItem.count && baseIndex - i >= 0; ++i) {
                    prev.push(BitcoinAddresses.getAddressByIndex(scheme, changeNode, baseIndex - i, network));
                }

                return prev;
            }, []);
        } catch (e) {
            improveAndRethrow(e, "getLastAddresses");
        }
    }
}

async function createAddressBySchemeAndIncrementValue(scheme, label) {
    const walletId = Storage.getWalletId();
    const addressesIndexes = await AddressesDataApi.getAddressesIndexes(walletId);

    const { newAddress, coinIndex, accountIndex, changeIndex } = BitcoinAddresses.createNewExternalAddressByScheme(
        Storage.getAccountsData(),
        Storage.getCurrentNetwork(),
        addressesIndexes,
        scheme
    );
    const path = scheme.getChangeNodePath(coinIndex, accountIndex, changeIndex);

    const encryptedAddressData = new Address(newAddress, label).encryptAndSerialize(Storage.getDataPassword());
    const addressUUID = v4();
    const addressesData = [{ uuid: addressUUID, encryptedAddressData }];

    const baseIndex = AddressesDataAdapter.getIndexByPath(addressesIndexes, path);
    await AddressesDataApi.incrementAddressesIndexAndSaveAddressesData(walletId, path, addressesData, baseIndex);

    return { uuid: addressUUID, address: newAddress };
}
