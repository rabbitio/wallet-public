import bip32 from "bip32";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { bip44Scheme } from "../../btc/lib/addresses-schemes";

export class EthKeys {
    /**
     * Generates ethereum keys for path m/44'/60'/0'/0/0 by given mnemonic and passphrase for network
     * TODO: [tests, critical] implement unit tests
     *
     * @param mnemonic {string} mnemonic of the HD wallet
     * @param passphrase {string} passphrase of the HD wallet
     * @param network {Network} network to get keys in
     * @return {{ privateKey: string, publicKey: string }}
     */
    static generateKeysForAccountAddressByWalletCredentials(mnemonic, passphrase, network) {
        try {
            const accountData = bip44Scheme.generateAccountKeys(
                mnemonic,
                passphrase,
                network.coinIndex,
                network.defaultAccountIndex
            );
            const addressNode = deriveEthAddressNodeByAccountNode(
                bip32.fromPrivateKey(
                    Buffer.from(accountData.privateKeyHex, "hex"),
                    Buffer.from(accountData.chainCodeHex, "hex")
                )
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
     * @return {string} public key string
     */
    static generateAddressPublicKeyByAccountPublicKey(accountData) {
        try {
            const accountNode = bip32.fromPublicKey(
                Buffer.from(accountData.publicKeyHex, "hex"),
                Buffer.from(accountData.chainCodeHex, "hex")
            );
            const addressNode = deriveEthAddressNodeByAccountNode(accountNode);

            return `0x${addressNode.publicKey.toString("hex")}`;
        } catch (e) {
            improveAndRethrow(e, "generateAddressPublicKeyByAccountPublicKey");
        }
    }
}

/**
 * Private function to use the same derivation path to avoid mistakes.
 *
 * @param accountBip32Node {Object}
 * @return {Object}
 */
function deriveEthAddressNodeByAccountNode(accountBip32Node) {
    try {
        return accountBip32Node.derive(0).derive(0);
    } catch (e) {
        improveAndRethrow(e, "deriveEthAddressNodeByAccountNode");
    }
}
