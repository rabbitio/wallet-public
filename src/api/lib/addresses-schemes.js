import bitcoinJs from "bitcoinjs-lib";
import bip32 from "bip32";
import bip39 from "bip39";

/**
 * This module covers schemes that are used in derivation paths utilized in creation of addresses of specific types.
 * There are 3 types of addresses available now - P2PKH, P2WPKH, P2SH-P2WPKH for which specific schemes are present.
 * Other type of addresses (at least "scripted" - P2SH, P2WSH, P2SH-P2WSH) have no specific derivation schemes themselves.
 * But there are schemes for specific types of "scripted" addresses like Multisignature addresses. For example, bip45
 * describes scheme of Multisignature wallets (they have determined scripts and uses P2PKH addresses for scripts
 * generation). Currently this wallet does not support Multisignature.
 *
 * For compatibility reasons we also support legacy bip32 derivation paths as some wallets are still using them.
 */

/**
 * Base class for schemes, should not be instantiated (will throw an error)
 */
class Scheme {
    constructor(number) {
        if (new.target === Scheme) {
            throw new TypeError("Scheme class cannot be constructed. ");
        }

        this.scheme = number;
    }

    /**
     * Generates public key and chain code for desired account of given wallet.
     *
     * @param mnemonic - mnemonic phrase to generate account keys for
     * @param password - password for mnemonic phrase
     * @param coinIndex - index of desired coin in HD wallet
     * @param accountIndex - desired account index in HD wallet for specified coin
     *
     * @return {{publicKeyHex: String, chainCodeHex: string}}
     */
    generateAccountKeys(mnemonic, password, coinIndex, accountIndex) {
        const accountNode = this.deriveAccountNode(mnemonic, password, coinIndex, accountIndex);
        return {
            publicKeyHex: Buffer.from(accountNode.publicKey).toString("hex"),
            chainCodeHex: accountNode.chainCode.toString("hex"),
        };
    }

    /**
     * Derives account node of HD wallet by bip44 derivation path.
     * We are using public/hardened derivations on each level according to protocol specification.
     * (Look at https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki for details)
     *
     * @param mnemonic - mnemonic phrase to generate account for
     * @param password - password for mnemonic to generate HD seed
     * @param coinIndex - bip44's 'coin_type', see specs
     * @param accountIndex - bip44's 'account', see specs
     * @return Node - Change node for specific scheme, coin type, account and change
     */
    deriveAccountNode(mnemonic, password, coinIndex, accountIndex) {
        const seedHex = bip39.mnemonicToSeedHex(mnemonic, password);
        const masterNode = bip32.fromSeed(Buffer.from(seedHex, "hex"));
        const path = `m/${this.scheme}'/${coinIndex}'/${accountIndex}'`;
        return masterNode.derivePath(path);
    }

    /**
     * Derives neutered change node of HD wallet. Such a node can be used to generate addresses or just public keys
     * but cannot be used for private keys generation.
     *
     * @param accountsData - AccountsData instance
     * @param network - network to derive node in
     * @param accountIndex - index of account to derive node in - not used currently as we are using default account index of network
     * @param changeIndex - index of change node (bip32, bip44) paths
     * @return BIP32 Change Node
     */
    deriveNeuteredChangeNodeForAccount(accountsData, network, accountIndex, changeIndex) {
        const accountData = accountsData.getAccountData(this, network, accountIndex);
        const publicKey = Buffer.from(accountData.publicKeyHex, "hex");
        const chainCode = Buffer.from(accountData.chainCodeHex, "hex");
        const accountNodeNeutered = bip32.fromPublicKey(publicKey, chainCode, network.bitcoinjsNetwork);

        return accountNodeNeutered.derive(changeIndex); // Not hardened derivation
    }

    /**
     * Derives change node of HD wallet by bip44 derivation path.
     * We are using public/hardened derivations on each level according to protocol specification.
     * (Look at https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki for details)
     *
     * @param seedHex - seed of wallet in hex format to derive address for
     * @param coinIndex - bip44's 'coin_type', see specs
     * @param accountIndex - bip44's 'account', see specs
     * @param changeIndex - bip44's 'change', see specs
     * @return Node - Change node for specific scheme, coin type, account and change
     */
    deriveChangeNodeBySeed(seedHex, coinIndex, accountIndex, changeIndex) {
        const masterNode = bip32.fromSeed(Buffer.from(seedHex, "hex"));
        const path = this.getChangeNodePath(coinIndex, accountIndex, changeIndex);
        return masterNode.derivePath(path);
    }

    /**
     * Generates address corresponding to the scheme. Should be overridden by descendants.
     *
     * @param ecPair - ecPair (maybe neutered) to generate address for
     * @param network - network to generate address in
     */
    createBitcoinAddress(ecPair, network) {
        throw new TypeError("Prohibited method call on Scheme base class. ");
    }

    /**
     * Generates path on base of given path params
     *
     * @param coinIndex - index of coin
     * @param accountIndex - index of account
     * @param changeIndex - change index
     * @return String - final path
     */
    getChangeNodePath(coinIndex, accountIndex, changeIndex) {
        return `m/${this.scheme}'/${coinIndex}'/${accountIndex}'/${changeIndex}`;
    }

    /**
     * Checks whether given path is belonging to this scheme
     *
     * @param path - path string to be checked
     * @return boolean - true if path matches this scheme and false otherwise
     */
    isChangeNodePathBelongsToMe(path) {
        const regex = new RegExp(`^m/${this.scheme}'/\\d+'/\\d+'/\\d+$`, "g");
        return path.match(regex) !== null;
    }
}

/**
 * P2PKH addresses derived by legacy bip32 derivation path.
 */
class Bip32Scheme extends Scheme {
    constructor() {
        super("32");
    }

    createBitcoinAddress(ecPair, network) {
        const { address } = bitcoinJs.payments.p2pkh({ pubkey: ecPair.publicKey, network: network.bitcoinjsNetwork });
        return address;
    }

    deriveAccountNode(mnemonic, password, coinIndex, accountIndex) {
        const seedHex = bip39.mnemonicToSeedHex(mnemonic, password);
        const masterNode = bip32.fromSeed(Buffer.from(seedHex, "hex"));
        const path = `m/${accountIndex}'`;
        return masterNode.derivePath(path);
    }

    deriveNeuteredChangeNodeForAccount(accountsData, network, accountIndex, changeIndex) {
        return super.deriveNeuteredChangeNodeForAccount(accountsData, network, accountIndex, changeIndex);
    }

    deriveChangeNodeBySeed(seedHex, coinIndex, accountIndex, changeIndex) {
        const masterNode = bip32.fromSeed(Buffer.from(seedHex, "hex"));
        const path = this.getChangeNodePath(coinIndex, accountIndex, changeIndex);

        return masterNode.derivePath(path);
    }

    getChangeNodePath(coinIndex, accountIndex, changeIndex) {
        // TODO: [feature, low] BIP32 scheme does not specify exact format of derivation path so different wallets have been using different paths for a while. This path is just "bip44-compatible". To actually scan all addresses of this scheme additional schemes should be implemented in this module with custom paths. But for now we are ok with this one until users will have begun to ask us about support of other
        return `m/${accountIndex}'/${changeIndex}`;
    }

    isChangeNodePathBelongsToMe(path) {
        const regex = new RegExp(`^m/\\d+'/\\d+$`, "g");
        return path.match(regex) !== null;
    }
}

/**
 * P2PKH addresses
 */
class Bip44Scheme extends Scheme {
    constructor() {
        super("44");
    }

    createBitcoinAddress(ecPair, network) {
        const { address } = bitcoinJs.payments.p2pkh({ pubkey: ecPair.publicKey, network: network.bitcoinjsNetwork });
        return address;
    }
}

/**
 * P2SH-P2WPKH addresses
 */
class Bip49Scheme extends Scheme {
    constructor() {
        super("49");
    }

    createBitcoinAddress(ecPair, network) {
        const { address } = bitcoinJs.payments.p2sh({
            redeem: bitcoinJs.payments.p2wpkh({ pubkey: ecPair.publicKey, network: network.bitcoinjsNetwork }),
            network: network.bitcoinjsNetwork,
        });

        return address;
    }
}

/**
 * P2WPKH addresses
 */
class Bip84Scheme extends Scheme {
    constructor() {
        super("84");
    }

    createBitcoinAddress(ecPair, network) {
        const { address } = bitcoinJs.payments.p2wpkh({ pubkey: ecPair.publicKey, network: network.bitcoinjsNetwork });
        return address;
    }
}

export const bip32Scheme = new Bip32Scheme();
export const bip44Scheme = new Bip44Scheme();
export const bip49Scheme = new Bip49Scheme();
export const bip84Scheme = new Bip84Scheme();
export const SupportedSchemes = [bip32Scheme, bip44Scheme, bip49Scheme, bip84Scheme];
