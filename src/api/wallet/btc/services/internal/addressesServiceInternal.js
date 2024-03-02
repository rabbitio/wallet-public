import bip39 from "bip39";

import { improveAndRethrow } from "@rabbitio/ui-kit";

import AddressesDataApi from "../../../common/backend-api/addressesDataApi.js";
import { Storage } from "../../../../common/services/internal/storage.js";
import {
    EXTERNAL_CHANGE_INDEX,
    getAllUsedAddressesByIndexes,
    EcPairsUtils,
    INTERNAL_CHANGE_INDEX,
} from "../../lib/addresses.js";
import CurrentAddressUtils from "../utils/currentAddressUtils.js";
import { decrypt } from "../../../../common/adapters/crypto-utils.js";
import { Logger } from "../../../../support/services/internal/logs/logger.js";

// TODO: [ether, critical] add support for all coins here
export default class AddressesServiceInternal {
    /**
     * Generates! all used/current addresses by retrieving current indexes of addresses.
     * It is better than getting all addresses from server with all other unneeded data and
     * analysing which of them are internal and which are external. It is mostly for internal use.
     *
     * @return {Promise<{ internal: string[], external: string[] }>}
     */
    static async getAllUsedAddresses(indexes = null) {
        try {
            if (indexes == null) {
                indexes = await AddressesDataApi.getAddressesIndexes(Storage.getWalletId());
            }

            return getAllUsedAddressesByIndexes(Storage.getAccountsData(), Storage.getCurrentNetwork(), indexes);
        } catch (e) {
            improveAndRethrow(e, "getAllUsedAddresses");
        }
    }

    /**
     * Performs scanning of addresses nodes of wallet to get the greatest used nodes index for given networks.
     * This is very heavy method and should be used accurately. It is for internal use only as normally
     * there is no need to perform exhaustive scanning. We only need it as a part of import process
     * or for maintenance reasons.
     *
     * @param networks - list of bitcoin networks to perform scanning for
     * @param schemes - addresses schemes to be scanned as array
     */
    static async performScanningOfAddresses(networks, schemes) {
        try {
            const accountsData = Storage.getAccountsData();
            const walletId = Storage.getWalletId();
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
     *
     * @param password {string} password of the wallet to export private keys
     * @return {Promise<{ address: string, privateKey: string }[]>}
     */
    // TODO: [tests, moderate] Units
    static async exportAddressesWithPrivateKeysByPassword(password) {
        const loggerSource = "exportAddressesWithPrivateKeysByPassword";
        try {
            Logger.log("Started exporting addresses and private keys", loggerSource);
            const indexes = await AddressesDataApi.getAddressesIndexes(Storage.getWalletId());
            const network = Storage.getCurrentNetwork();
            const allAddresses = getAllUsedAddressesByIndexes(Storage.getAccountsData(), network, indexes);
            const encryptedWalletCredentials = Storage.getEncryptedWalletCredentials();
            const mnemonic = decrypt(encryptedWalletCredentials.encryptedMnemonic, password);
            const passphrase = decrypt(encryptedWalletCredentials.encryptedPassphrase, password);
            const seedHex = bip39.mnemonicToSeedHex(mnemonic, passphrase);
            const addressesArray = allAddresses.internal.concat(allAddresses.external);
            const addressesToEcPairs = EcPairsUtils.getEcPairsToAddressesMapping(
                addressesArray,
                seedHex,
                network,
                indexes
            );

            Logger.log(`Exported ${addressesToEcPairs.length} addresses and private keys. Returning`, loggerSource);

            return addressesToEcPairs.map(mappingItem => {
                return { address: mappingItem.address, privateKey: mappingItem.ecPair.toWIF() };
            });
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }
}
