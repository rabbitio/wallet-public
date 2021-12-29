import bip39 from "bip39";

import AddressesDataApi from "../../external-apis/backend-api/addressesDataApi";
import { getAccountsData, getCurrentNetwork, getEncryptedWalletCredentials, getWalletId } from "./storage";
import {
    EXTERNAL_CHANGE_INDEX,
    getAllUsedAddressesByIndexes,
    getEcPairsToAddressesMapping,
    INTERNAL_CHANGE_INDEX,
} from "../../lib/addresses";
import { improveAndRethrow } from "../../utils/errorUtils";
import CurrentAddressUtils from "../utils/currentAddressUtils";
import { decrypt } from "../../adapters/crypto-utils";

export default class AddressesServiceInternal {
    /**
     * Generates! all used/current addresses by retrieving current indexes of addresses.
     * It is better than getting all addresses from server with all other unneeded data and
     * analysing which of them are internal and which are external. It is mostly for internal use.
     *
     * @return Promise resolving to Object { internal: Array of addresses, external: Array of addresses }
     */
    static async getAllUsedAddresses() {
        try {
            const indexes = await AddressesDataApi.getAddressesIndexes(getWalletId());

            return getAllUsedAddressesByIndexes(getAccountsData(), getCurrentNetwork(), indexes);
        } catch (e) {
            improveAndRethrow(e, "getAllUsedAddresses");
        }
    }

    /**
     * Performs scanning of addresses nodes of wallet to get greatest used nodes index for given networks.
     * This is very heavy method and should be used accurately. It is for internal use only as normally
     * there is no need to perform exhaustive scanning. We only need it as a part of import process
     * or for maintenance reasons.
     *
     * @param networks - list of bitcoin networks to perform scanning for
     * @param schemes - addresses schemes to be scanned as array
     */
    static async performScanningOfAddresses(networks, schemes) {
        try {
            const accountsData = getAccountsData();
            const walletId = getWalletId();
            const changeIndexes = [INTERNAL_CHANGE_INDEX, EXTERNAL_CHANGE_INDEX];
            const promises = changeIndexes.reduce((promisesOfAllIndexes, changeIndex) => {
                const promisesForIndexAndNetworks = networks.reduce((promisesOfNetworks, network) => {
                    const promisesForNetwork = [];
                    for (let i = 0; i < schemes.length; ++i) {
                        const newPromise = CurrentAddressUtils._getCurrentAddress(
                            accountsData,
                            network,
                            walletId,
                            schemes[i],
                            network.defaultAccountIndex,
                            changeIndex,
                            true
                        ).catch(e => {
                            throw new Error(
                                `Branch: scheme: ${schemes[i].scheme}, ${network.key},` +
                                    `account: ${network.defaultAccountIndex}, ` +
                                    `change: ${changeIndex}. Error: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`
                            );
                        });
                        promisesForNetwork.push(newPromise);
                    }

                    return promisesOfNetworks.concat(promisesForNetwork);
                }, []);

                return promisesOfAllIndexes.concat(promisesForIndexAndNetworks);
            }, []);

            await Promise.all(promises);
        } catch (e) {
            improveAndRethrow(e, "performScanningOfAddresses");
        }
    }

    /**
     * Exports all used/current addresses and their private keys (WIF).
     * @param password - password of the wallet to export private keys
     * @return Promise resolving to Array of objects of following format: { address: string, privateKey: string }
     */
    // TODO: [tests, moderate] Units
    static async exportAddressesWithPrivateKeysByPassword(password) {
        try {
            const indexes = await AddressesDataApi.getAddressesIndexes(getWalletId());
            const network = getCurrentNetwork();
            const allAddresses = getAllUsedAddressesByIndexes(getAccountsData(), network, indexes);
            const encryptedWalletCredentials = getEncryptedWalletCredentials();
            const mnemonic = decrypt(encryptedWalletCredentials.encryptedMnemonic, password);
            const passphrase = decrypt(encryptedWalletCredentials.encryptedPassphrase, password);
            const seedHex = bip39.mnemonicToSeedHex(mnemonic, passphrase);
            const addressesArray = allAddresses.internal.concat(allAddresses.external);
            const addressesToEcPairs = getEcPairsToAddressesMapping(addressesArray, seedHex, network, indexes);

            return addressesToEcPairs.map(mappingItem => {
                return { address: mappingItem.address, privateKey: mappingItem.ecPair.toWIF() };
            });
        } catch (e) {
            improveAndRethrow(e, "exportAddressesWithPrivateKeysByPassword");
        }
    }
}
