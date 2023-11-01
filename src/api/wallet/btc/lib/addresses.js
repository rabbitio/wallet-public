import bitcoinJs from "bitcoinjs-lib";
import buffer from "safe-buffer";

import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { bip44Scheme, bip49Scheme, bip84Scheme, SupportedSchemes } from "./addresses-schemes";
import AddressesDataAdapter from "../../common/backend-api/adapters/addressesDataAdapter";
import { BitcoinJsAdapter } from "../adapters/bitcoinJsAdapter";
import { Coins } from "../../coins";
import { Network } from "../../common/models/networks";

export const GAP_LIMIT = 20; // See BIP44 for details on gap limit
export const EXTERNAL_CHANGE_INDEX = 0;
export const INTERNAL_CHANGE_INDEX = 1;
export const CHANGE_SCHEME = bip84Scheme;
export const EXTERNAL_SCHEME = bip84Scheme;
export const LEGACY_SCHEME = bip44Scheme;
export const SEGWIT_P2SH_COMPATIBLE_SCHEME = bip49Scheme;

const Buffer = buffer.Buffer;

/**
 * Validates given bitcoin address of specified network.
 * Uses bitcoinjs ouput script creation function which fails in case of invalid address given.
 * (see https://github.com/bitcoinjs/bitcoinjs-lib/issues/890#issuecomment-329371169 for details).
 *
 * @param address {string} bitcoin address of any type (mandatory)
 * @param [network=null] {Network|null} bitcoin network to which given address belongs (optional)
 * @return {boolean} true if address is valid and false otherwise
 */
export function isAddressValid(address, network = null) {
    try {
        if (!(network instanceof Network)) {
            network = getNetworkByAddress(address);
        }
        bitcoinJs.address.toOutputScript(address, BitcoinJsAdapter.toBitcoinJsNetwork(network.key));
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Checks whether address is of P2PKH format (testnet or mainnet).
 * Note that this method is not validating correctness of address, it is just checking by prefixes.
 *
 * See all prefixes at https://en.bitcoin.it/wiki/List_of_address_prefixes
 *
 * @param address {string} address to be checked
 * @return {boolean} true if address is of P2PKH format and false otherwise
 */
export function isP2pkhAddress(address) {
    return typeof address === "string" && (address.match(/^1/g) || address.match(/^[mn]/g));
}

/**
 * Checks whether address is of P2SH format (testnet or mainnet).
 * Note that this method is not validating correctness of address, it is just checking by prefixes.
 *
 * See all prefixes at https://en.bitcoin.it/wiki/List_of_address_prefixes
 * @param address - address to be checked
 * @return boolean - true if address is of P2SH format and false otherwise
 */
export function isP2shAddress(address) {
    return address && (address.match(/^3/g) || address.match(/^2/g));
}

/**
 * Checks whether address is of SegWit (bech32) format (testnet or mainnet).
 * Note that this method is not validating correctness of address, it is just checking by prefixes.
 *
 * See all prefixes at https://en.bitcoin.it/wiki/List_of_address_prefixes
 *
 * @param address {string} address to be checked
 * @return {boolean} true if address is of SegWit format and false otherwise
 */
export function isSegWitAddress(address) {
    return typeof address === "string" && (address.match(/^bc1/g) || address.match(/^tb1/g));
}

/**
 * Checks whether address is of P2WPKH format.
 * Note that this method is not validating correctness of address, it is just checking by prefixes/length.
 *
 * See all prefixes at https://en.bitcoin.it/wiki/List_of_address_prefixes
 *
 * @param address {string} address to be checked
 * @return {boolean} true if address is of P2WPKH format and false otherwise
 */
export function isP2wpkhAddress(address) {
    return typeof address === "string" && address.length === 42 && (address.match(/^bc1q/g) || address.match(/^tb1q/g));
}

/**
 * Returns Bitcoin network of given address.
 * Just checks the prefix of address as it is unambiguously witnesses the ownership by one of networks.
 * Supports only P2PKH, P2SH, bech32 addresses.
 *
 * Throws error if prefix is not supported (actually there are a lot of prefixes, we use just only relevant,
 * see https://en.bitcoin.it/wiki/List_of_address_prefixes for details).
 *
 * @param address {string}
 * @returns {Network}
 */
export function getNetworkByAddress(address) {
    if (address.match(/^1/g) || address.match(/^3/g) || address.match(/^bc1/g)) {
        return Coins.COINS.BTC.mainnet;
    }

    if (address.match(/^[mn]/g) || address.match(/^2/g) || address.match(/^tb1/g)) {
        return Coins.COINS.BTC.testnet;
    }

    throw new Error("Cannot determine network by address: " + address);
}

/**
 * Generates address by given params
 *
 * @param scheme {Scheme} scheme to generate address for
 * @param changeNode {Object} change node to derive address node from
 * @param addressIndex {number} index of an address to be derived from passed change node
 * @param network {Network} notwork to work with
 * @returns {string} generated address
 */
export function getAddressByIndex(scheme, changeNode, addressIndex, network) {
    const { publicKey } = changeNode.derive(addressIndex);
    const ecPair = bitcoinJs.ECPair.fromPublicKey(
        Buffer.from(publicKey),
        BitcoinJsAdapter.toBitcoinJsNetwork(network.key)
    );

    return scheme.createBitcoinAddress(ecPair, network);
}

/**
 * Creates new external address for given accounts data, network, addresses indexes and scheme.
 * TODO: [feature, moderate/maybe] Check that GAP_LIMIT is not exceeded, maybe schedule it
 *
 * @param accountsData {AccountsData} accounts data of the wallet
 * @param network {Network} network to work in
 * @param addressNodesIndexes {Object} addresses indexes of the wallet
 * @param scheme {Scheme} scheme to create address for
 * @param incrementWith {number} value to increment current address index with, default is 1
 * @return {{accountIndex: number, coinIndex: number, changeIndex: number, newAddress: string}}
 */
export function createNewExternalAddressByScheme(
    accountsData,
    network,
    addressNodesIndexes,
    scheme,
    incrementWith = 1
) {
    try {
        const coinIndex = network.coinIndex;
        const accountIndex = network.defaultAccountIndex;
        const externalChangeNode = scheme.deriveNeuteredChangeNodeForAccount(
            accountsData,
            network,
            accountIndex,
            EXTERNAL_CHANGE_INDEX
        );
        const path = scheme.getChangeNodePath(coinIndex, accountIndex, EXTERNAL_CHANGE_INDEX);
        const externalAddressNodeIndex = AddressesDataAdapter.getIndexByPath(addressNodesIndexes, path);

        const newAddress = getAddressByIndex(
            scheme,
            externalChangeNode,
            externalAddressNodeIndex + incrementWith,
            network
        );

        return { newAddress, coinIndex, accountIndex, changeIndex: EXTERNAL_CHANGE_INDEX };
    } catch (e) {
        improveAndRethrow(e, "createNewExternalAddressByScheme");
    }
}

/**
 * Returns all used addresses for given accountsData, networks and schemes.
 *
 * Returns separated internal and external addresses.
 *
 * @param accountsData - All wallet's accounts data to get addresses for
 * @param network - network to retrieve addresses for
 * @param indexes - indexes of addresses of the wallet
 * @param schemes - schemes to get addresses for (by default all supported are being used)
 * @returns Object { internal: Array, external: Array }
 */
export function getAllUsedAddressesByIndexes(accountsData, network, indexes, schemes = SupportedSchemes) {
    try {
        schemes = getUsedSchemesByAddressesPathsArray(
            schemes,
            indexes.map(indexItem => indexItem.path)
        );

        return {
            internal: getAllUsedAddressesForBranch(accountsData, schemes, network, INTERNAL_CHANGE_INDEX, indexes),
            external: getAllUsedAddressesForBranch(accountsData, schemes, network, EXTERNAL_CHANGE_INDEX, indexes),
        };
    } catch (e) {
        improveAndRethrow(e, "getAllUsedAddressesByIndexes");
    }
}

function getUsedSchemesByAddressesPathsArray(allSchemes, addressesPaths) {
    return allSchemes.filter(scheme => addressesPaths.find(path => scheme.isChangeNodePathBelongsToMe(path)));
}

/**
 * Gets all addresses used in given scheme's account's change node in specified network.
 * Address is considered as used only if its index is less than index of address in
 * addressesNodesIndexes (by specified path). This method does not perform any stuff like scanning of addresses or
 * checking whether address is used or not.
 *
 * @param accountsData {AccountsData} accounts data to get addresses by
 * @param schemes {Scheme[]} schemes to get addresses for
 * @param network {Network} network to get addresses in
 * @param changeNodeIndex {number} index of change node (ip32, bip44) to get addresses for
 * @param addressesNodesIndexes {Object} object of indexes of addresses by paths
 * @return {string[]} all used addresses for specified path
 */
function getAllUsedAddressesForBranch(accountsData, schemes, network, changeNodeIndex, addressesNodesIndexes) {
    try {
        const addresses = [];
        const coinIndex = network.coinIndex;
        const accountIndex = network.defaultAccountIndex;
        schemes.forEach(scheme => {
            const currentAddressIndex = AddressesDataAdapter.getIndexByPath(
                addressesNodesIndexes,
                scheme.getChangeNodePath(coinIndex, accountIndex, changeNodeIndex)
            );
            const changeNode = scheme.deriveNeuteredChangeNodeForAccount(
                accountsData,
                network,
                accountIndex,
                changeNodeIndex
            );

            for (let index = 0; index <= currentAddressIndex; ++index) {
                const address = getAddressByIndex(scheme, changeNode, index, network);
                addresses.push(address);
            }
        });

        return addresses;
    } catch (e) {
        improveAndRethrow(e, "getAllUsedAddressesForBranch");
    }
}

export class EcPairsMappingEntry {
    constructor(address, scheme, ecPair) {
        this.address = address;
        this.scheme = scheme;
        this.ecPair = ecPair;
    }
}

/**
 * Looks up all used addresses on both internal and external accounts of wallet and tries to find matches
 * with passed addresses. When match is found corresponding address with ECPair (bitcoinjs lib) are being added
 * to mapping (and address scheme also).
 *
 * @param mappingAddresses {string[]} addresses for which ECPairs are searched. Note that addresses are not
 *                           being validated here, it is up to client
 * @param seedHex {string} hex seed of wallet
 * @param network {Network} BTC network to create ECPairs for
 * @param indexes {Object[]} indexes of addresses of the wallet
 * @param schemes {Scheme[]} derivation schemes to be scanned for addresses
 * @returns {EcPairsMappingEntry[]}
 */
export function getEcPairsToAddressesMapping(mappingAddresses, seedHex, network, indexes, schemes = SupportedSchemes) {
    try {
        const coinIndex = network.coinIndex;
        const accountIndex = network.defaultAccountIndex;
        const changeNodes = [];
        schemes = getUsedSchemesByAddressesPathsArray(
            schemes,
            indexes.map(indexItem => indexItem.path)
        );
        schemes.forEach(scheme => {
            [INTERNAL_CHANGE_INDEX, EXTERNAL_CHANGE_INDEX].forEach(changeIndex => {
                const changeNode = scheme.deriveChangeNodeBySeed(seedHex, coinIndex, accountIndex, changeIndex);
                const addressNodeIndex = AddressesDataAdapter.getIndexByPath(
                    indexes,
                    scheme.getChangeNodePath(coinIndex, accountIndex, changeIndex)
                );
                changeNodes.push({ changeNode, scheme, index: addressNodeIndex });
            });
        });

        const mapping = [];
        changeNodes.forEach(changeNodeData => {
            for (let index = 0; index <= changeNodeData.index; ++index) {
                const { privateKey } = changeNodeData.changeNode.derive(index);
                const ecPair = bitcoinJs.ECPair.fromPrivateKey(privateKey, {
                    network: BitcoinJsAdapter.toBitcoinJsNetwork(network.key),
                });
                const nodeAddress = changeNodeData.scheme.createBitcoinAddress(ecPair, network);

                for (let mappingAddress of mappingAddresses) {
                    if (nodeAddress === mappingAddress) {
                        mapping.push(new EcPairsMappingEntry(mappingAddress, changeNodeData.scheme, ecPair));
                        break;
                    }
                }
            }
        });

        return mapping;
    } catch (e) {
        improveAndRethrow(e, "getEcPairsToAddressesMapping");
    }
}

/**
 * Maps given addresses to random ecPair. Useful for fee estimation.
 *
 * @param mappingAddresses {string[]} addresses for which ECPairs are searched. Note that addresses are not
 *                           being validated here, it is up to client
 * @param network {Network} BTC network to create ECPairs for
 * @returns {EcPairsMappingEntry[]}
 */
export function getMappingOfAddressesToRandomEcPair(mappingAddresses, network) {
    try {
        const randomEcPair = bitcoinJs.ECPair.makeRandom({ network: BitcoinJsAdapter.toBitcoinJsNetwork(network.key) });

        return mappingAddresses.map(address => {
            return new EcPairsMappingEntry(address, null, randomEcPair);
        });
    } catch (e) {
        improveAndRethrow(e, "getMappingOfAddressesToRandomEcPair");
    }
}

/**
 * Returns true for addresses from given array if address corresponds to bip49 scheme.
 * Gets all addresses from default account of given network by accounts data and current indexes of used addresses,
 * then compares given addresses with got addresses and fills mapping for bip49 addresses from given array.
 *
 * @param accountsData {AccountsData} accounts data to get account data from
 * @param addresses {string[]} list of addresses to be checked
 * @param addressIndexes {Object[]} indexes of addresses
 * @param network {Network} network to get addresses for
 * @return {{ [string]: boolean }}
 */
export function isBip49Addresses(accountsData, addresses, addressIndexes, network) {
    try {
        const account = network.defaultAccountIndex;
        const coinIndex = network.coinIndex;
        const isAddressBip49 = {};
        [EXTERNAL_CHANGE_INDEX, INTERNAL_CHANGE_INDEX].forEach(changeIndex => {
            const currentAddressIndex = AddressesDataAdapter.getIndexByPath(
                addressIndexes,
                SEGWIT_P2SH_COMPATIBLE_SCHEME.getChangeNodePath(coinIndex, account, changeIndex)
            );
            const changeNode = SEGWIT_P2SH_COMPATIBLE_SCHEME.deriveNeuteredChangeNodeForAccount(
                accountsData,
                network,
                account,
                changeIndex
            );
            for (let addressIndex = 0; addressIndex <= currentAddressIndex; ++addressIndex) {
                const bip49Address = getAddressByIndex(
                    SEGWIT_P2SH_COMPATIBLE_SCHEME,
                    changeNode,
                    addressIndex,
                    network
                );
                if (addresses.filter(address => address === bip49Address).length) {
                    isAddressBip49[bip49Address] = true;
                }
            }
        });

        return isAddressBip49;
    } catch (e) {
        improveAndRethrow(e, "isBip49Addresses");
    }
}

/**
 * Returns standard path for external addresses for specific network.
 *
 * @param network {Network} network to get path for
 * @param [scheme] {Scheme}
 * @return {string} final path
 */
export function getExternalAddressPath(network, scheme = EXTERNAL_SCHEME) {
    return scheme.getChangeNodePath(network.coinIndex, network.defaultAccountIndex, EXTERNAL_CHANGE_INDEX);
}
