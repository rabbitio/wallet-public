import is from "is_js";
import uuid from "uuid";

import { getAccountsData, getCurrentNetwork, getDataPassword, getWalletId } from "./internal/storage";
import { hasMinConfirmations } from "../lib/transactions/transactions-utils";
import { improveAndRethrow } from "../utils/errorUtils";
import {
    CHANGE_SCHEME,
    EXTERNAL_SCHEME,
    LEGACY_SCHEME,
    createNewExternalAddressByScheme,
    EXTERNAL_CHANGE_INDEX,
    getExternalAddressPath,
    INTERNAL_CHANGE_INDEX,
    getNetworkByAddress,
    getAddressByIndex,
} from "../lib/addresses";
import Address from "../models/address";
import CurrentAddressUtils from "./utils/currentAddressUtils";
import AddressesDataApi from "../external-apis/backend-api/addressesDataApi";
import AddressesDataAdapter from "../external-apis/backend-api/adapters/addressesDataAdapter";
import { transactionsDataProvider } from "./internal/transactionsDataProvider";
import { getWalletData, savePreference } from "../external-apis/backend-api/walletsApi";
import { Logger } from "./internal/logs/logger";
import { EventBus, NEW_ADDRESS_CREATED_EVENT } from "../adapters/eventbus";

export default class AddressesService {
    // TODO: [tests, moderate] units
    static async getConfirmedTransactionsSendingToAddresses(addresses) {
        try {
            const allTransactions = await transactionsDataProvider.getTransactionsByAddresses(addresses);

            return allTransactions.filter(transaction => hasMinConfirmations(transaction));
        } catch (e) {
            improveAndRethrow(e, this.getConfirmedTransactionsSendingToAddresses);
        }
    }

    /**
     * Creates new external address
     *
     * @returns Promise resolving to { uuid: string, address: string }
     */
    static async createNewExternalAddress(label) {
        const loggerSource = "createNewExternalAddress";

        try {
            Logger.log("Start creating new external address", loggerSource);

            const addressType = await this.getAddressesType();

            Logger.log(`Address type: ${addressType}`, loggerSource);

            const scheme = addressType === this.ADDRESSES_TYPES.SEGWIT ? EXTERNAL_SCHEME : LEGACY_SCHEME;
            const address = await createAddressBySchemeAndIncrementValue(scheme, label || Address.labelAutogenerated);

            EventBus.dispatch(NEW_ADDRESS_CREATED_EVENT);

            Logger.log(`Address created: ${address}`, loggerSource);
            return address;
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Creates new external address for invoice.
     *
     * Creates also new external address to avoid usage of this new address of invoice
     * as current external address (as it is calculated by the only index of current address also used for
     * addresses of invoices).
     *
     * @returns Promise resolving to new address
     */
    static async createNewAddressForInvoice(label = "Autogenerated") {
        const loggerSource = "createNewAddressForInvoice";
        try {
            Logger.log("Start creating new invoice address", loggerSource);

            const walletId = getWalletId();
            const addressesIndexes = await AddressesDataApi.getAddressesIndexes(walletId);

            const addressType = await this.getAddressesType();
            const scheme = addressType === this.ADDRESSES_TYPES.SEGWIT ? EXTERNAL_SCHEME : LEGACY_SCHEME;

            const resultForAddressOfInvoice = createNewExternalAddressByScheme(
                getAccountsData(),
                getCurrentNetwork(),
                addressesIndexes,
                scheme
            );

            Logger.log(`New invoice address ${resultForAddressOfInvoice.newAddress}`, loggerSource);

            const resultForNewExternalAddress = createNewExternalAddressByScheme(
                getAccountsData(),
                getCurrentNetwork(),
                addressesIndexes,
                scheme,
                2
            );

            Logger.log(`New external address ${resultForNewExternalAddress.newAddress}`, loggerSource);

            const { coinIndex, accountIndex, changeIndex } = resultForAddressOfInvoice;
            const path = scheme.getChangeNodePath(coinIndex, accountIndex, changeIndex);

            const dataPassword = getDataPassword();
            const encryptedAddressesData = [
                new Address(resultForAddressOfInvoice.newAddress, label).encryptAndSerialize(dataPassword),
                new Address(resultForNewExternalAddress.newAddress, Address.labelAutogenerated).encryptAndSerialize(
                    dataPassword
                ),
            ];
            const addressesData = [
                { uuid: uuid.v4(), encryptedAddressData: encryptedAddressesData[0] },
                { uuid: uuid.v4(), encryptedAddressData: encryptedAddressesData[1] },
            ];

            const baseIndex = AddressesDataAdapter.getIndexByPath(addressesIndexes, path);
            await AddressesDataApi.incrementAddressesIndexAndSaveAddressesData(
                walletId,
                path,
                addressesData,
                baseIndex
            );

            Logger.log(`Successfully incremented index of address. Returning invoice address.`, loggerSource);
            return resultForAddressOfInvoice.newAddress;
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Creates initial data to be passed during wallet creation.
     *
     * @param accountsData - accounts data of wallet to generate initial data for
     * @param password - optional password for data encryption
     * @returns Object { initialIndexesData: some data, initialAddressesData: some data }
     */
    static createInitialAddressesData(accountsData, password) {
        const loggerSource = "createInitialAddressesData";
        Logger.log(`Start creating initial addresses data`, loggerSource);

        const network = getCurrentNetwork();
        const { newAddress } = createNewExternalAddressByScheme(accountsData, network, [], EXTERNAL_SCHEME);
        const initialAddressPath = getExternalAddressPath(network);
        const initialAddressData = new Address(newAddress, Address.labelAutogenerated);
        const serializedEncryptedData = initialAddressData.encryptAndSerialize(password || getDataPassword());

        Logger.log(`Initial addresses data created: ${initialAddressPath}/${0} - ${newAddress}`, loggerSource);

        return {
            initialIndexesData: AddressesDataAdapter.toServerFormatOfInitialIndexesData(initialAddressPath, 0),
            initialAddressesData: AddressesDataAdapter.toServerFormatOfInitialAddressesData(
                uuid.v4(),
                serializedEncryptedData
            ),
        };
    }

    /**
     * Updates address data

     * @param uuid - UUID of updating address
     * @param address - address to update data for
     * @param creationTime - creation time of address
     * @param newLabel - new label value
     * @return Promise resolving to nothing
     */
    static async updateAddressData(uuid, address, creationTime, newLabel) {
        const loggerSource = "updateAddressData";
        try {
            Logger.log(`Start updating addresses data ${address}: "${newLabel}"`, loggerSource);

            const newAddressData = new Address(address, newLabel, creationTime).encryptAndSerialize(getDataPassword());
            const result = await AddressesDataApi.updateAddressData(getWalletId(), uuid, newAddressData);

            if (result === null) {
                Logger.log("Address not found, returning error", loggerSource);

                return {
                    result: false,
                    errorDescription: "We searched high and low but we couldn't find the address on our server.",
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

            await savePreference(getWalletId(), "addressesType", addressesType);
            Logger.log(`Address type selection saved ${addressesType}`, loggerSource);
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Returns addresses type stored on server. If addresses type is not stored returns SEGWIT type
     *
     * @return {Promise<string>}
     */
    static async getAddressesType() {
        try {
            const data = await getWalletData(getWalletId());

            return data?.settings?.addressesType || this.ADDRESSES_TYPES.SEGWIT;
        } catch (e) {
            improveAndRethrow(e, "saveAddressesType");
        }
    }

    /**
     * Deletes address data from server.
     *
     * @param addressUUID - uuid of address to delete data for - should be not empty string
     * @returns Promise resolving to nothing
     */
    static async deleteAddressData(addressUUID) {
        const loggerSource = "deleteAddressData";
        try {
            Logger.log(`Start deleting address data ${addressUUID}`, loggerSource);

            if (is.not.string(addressUUID) || is.empty(addressUUID)) {
                throw new Error("Address uuid should be not empty string. ");
            }

            await AddressesDataApi.deleteAddressData(getWalletId(), addressUUID);

            Logger.log(`Address data was removed ${addressUUID}`, loggerSource);
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Retrieves whole list of addresses data from server and returns decrypted data.
     *
     * @return Promise resolving to Array of Address
     */
    static async getAllAddressesData() {
        try {
            const list = await AddressesDataApi.getAddressesData(getWalletId());
            const dataPassword = getDataPassword();

            const currentNetwork = getCurrentNetwork();
            return list
                .map(addressDataItem => ({
                    ...Address.decryptAndDeserialize(addressDataItem.encryptedAddressData, dataPassword),
                    uuid: addressDataItem.uuid,
                }))
                .filter(addressData => getNetworkByAddress(addressData.address).key === currentNetwork.key);
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
     * @returns Promise resolving to address
     */
    static async getCurrentChangeAddress() {
        try {
            const network = getCurrentNetwork();
            return await CurrentAddressUtils._getCurrentAddress(
                getAccountsData(),
                network,
                getWalletId(),
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
     *  @returns Promise resolving to address
     */
    static async getCurrentExternalAddress() {
        try {
            const network = getCurrentNetwork();
            const addressType = await this.getAddressesType();
            const scheme = addressType === this.ADDRESSES_TYPES.SEGWIT ? EXTERNAL_SCHEME : LEGACY_SCHEME;

            return await CurrentAddressUtils._getCurrentAddress(
                getAccountsData(),
                network,
                getWalletId(),
                scheme,
                network.defaultAccountIndex,
                EXTERNAL_CHANGE_INDEX
            );
        } catch (e) {
            improveAndRethrow(e, "getCurrentExternalAddress");
        }
    }

    /**
     * Retrieves last addresses of  provided parameters
     *
     * @param request - array of params to get addresses by. Parameters should be Object with the following fields:
     *                  { count: number, change: boolean, type: string }
     *
     * @return {Promise<Array<String>>} Array of addresses
     */
    // TODO: [tests, moderate]
    static async getLastAddresses(request) {
        try {
            const indexes = await AddressesDataApi.getAddressesIndexes(getWalletId());
            const network = getCurrentNetwork();
            return request.reduce((prev, requestItem) => {
                const scheme = requestItem.type === this.ADDRESSES_TYPES.SEGWIT ? EXTERNAL_SCHEME : LEGACY_SCHEME;

                const path = scheme.getChangeNodePath(
                    network.coinIndex,
                    network.defaultAccountIndex,
                    requestItem.change ? 1 : 0
                );
                const baseIndex = AddressesDataAdapter.getIndexByPath(indexes, path);
                const changeNode = scheme.deriveNeuteredChangeNodeForAccount(
                    getAccountsData(),
                    network,
                    network.defaultAccountIndex,
                    requestItem.change ? 1 : 0
                );

                for (let i = 0; i < requestItem.count && baseIndex - i >= 0; ++i) {
                    prev.push(getAddressByIndex(scheme, changeNode, baseIndex - i, network));
                }

                return prev;
            }, []);
        } catch (e) {
            improveAndRethrow(e, "getLastAddresses");
        }
    }
}

async function createAddressBySchemeAndIncrementValue(scheme, label) {
    const walletId = getWalletId();
    const addressesIndexes = await AddressesDataApi.getAddressesIndexes(walletId);

    const { newAddress, coinIndex, accountIndex, changeIndex } = createNewExternalAddressByScheme(
        getAccountsData(),
        getCurrentNetwork(),
        addressesIndexes,
        scheme
    );
    const path = scheme.getChangeNodePath(coinIndex, accountIndex, changeIndex);

    const encryptedAddressData = new Address(newAddress, label).encryptAndSerialize(getDataPassword());
    const addressUUID = uuid.v4();
    const addressesData = [{ uuid: addressUUID, encryptedAddressData }];

    const baseIndex = AddressesDataAdapter.getIndexByPath(addressesIndexes, path);
    await AddressesDataApi.incrementAddressesIndexAndSaveAddressesData(walletId, path, addressesData, baseIndex);

    return { uuid: addressUUID, address: newAddress };
}
