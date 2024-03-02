import bip32 from "bip32";

import { improveAndRethrow } from "@rabbitio/ui-kit";

import { bip44Scheme } from "../../btc/lib/addresses-schemes.js";

export class KeysBip44 {
    /**
     * Generates keys for path m/44'/<coinIndex>'/0'/<changeIndex>/<addressIndex> by given mnemonic and passphrase for network
     * TODO: [tests, critical] implement unit tests
     *
     * Note: we use this custom keys generation (not some from the library) because we need passphrase to be a part
     * of calculation and also because we have more general system with accounts storing in localStorage.
     *
     * @param mnemonic {string} mnemonic of the HD wallet
     * @param passphrase {string} passphrase of the HD wallet
     * @param network {Network} network to get keys in
     * @param [changeIndex=0] {number} change node index according to bip44
     * @param [addressIndex=0] {number} address index according to bip44
     * @return {{ privateKey: Uint8Array, publicKey: Uint8Array }}
     */
    static generateKeysForAccountAddressByWalletCredentials(
        mnemonic,
        passphrase,
        network,
        changeIndex = 0,
        addressIndex = 0
    ) {
        try {
            const accountData = bip44Scheme.generateAccountKeys(
                mnemonic,
                passphrase,
                network.coinIndex,
                network.defaultAccountIndex
            );
            const addressNode = deriveBip32AddressNodeByAccountNode(
                bip32.fromPrivateKey(
                    Buffer.from(accountData.privateKeyHex, "hex"),
                    Buffer.from(accountData.chainCodeHex, "hex")
                ),
                changeIndex,
                addressIndex
            );

            return { privateKey: addressNode.privateKey, publicKey: addressNode.publicKey };
        } catch (e) {
            improveAndRethrow(e, "generateKeysForAccountAddressByWalletCredentials");
        }
    }

    /**
     * Generates ethereum public key for path m/44'/60'/0'/0/0 by given account data
     * TODO: [tests, critical] implement unit tests
     *
     * @param accountData {{ publicKeyHex: string, chainCodeHex: string }} account data
     * @param [changeIndex=0] {number} change node index according to bip44
     * @param [addressIndex=0] {number} address node index according to bip44
     * @return {string} public key string
     */
    static generateAddressPublicKeyByAccountPublicKey(accountData, changeIndex = 0, addressIndex = 0) {
        try {
            const accountNode = bip32.fromPublicKey(
                Buffer.from(accountData.publicKeyHex, "hex"),
                Buffer.from(accountData.chainCodeHex, "hex")
            );
            const addressNode = deriveBip32AddressNodeByAccountNode(accountNode, changeIndex, addressIndex);

            return `0x${addressNode.publicKey.toString("hex")}`;
        } catch (e) {
            improveAndRethrow(e, "generateAddressPublicKeyByAccountPublicKey");
        }
    }
}

/**
 * @param accountBip32Node {Object} bip32 library's object representing the account derivation node
 * @param [changeIndex=0] {number} change node index according to bip44
 * @param [addressIndex=0] {number} address node index according to bip44
 * @return {Object} bip32 library's object representing the address derivation node
 */
function deriveBip32AddressNodeByAccountNode(accountBip32Node, changeIndex = 0, addressIndex = 0) {
    try {
        return accountBip32Node.derive(changeIndex).derive(addressIndex);
    } catch (e) {
        improveAndRethrow(e, "deriveBip32AddressNodeByAccountNode");
    }
}
