import bitcoinJs from "bitcoinjs-lib";
import { ethers } from "ethers";

import { improveAndRethrow } from "@rabbitio/ui-kit";

import { Storage } from "../../../common/services/internal/storage.js";
import { Coins } from "../../coins.js";
import { bip44Scheme } from "../../btc/lib/addresses-schemes.js";
import { KeysBip44 } from "../../common/lib/keysBip44.js";
import { AuthService } from "../../../auth/services/authService.js";

export class TrxAddressesService {
    /**
     * Retrieves trx address for current wallet. Derivation path: m/44'/195'/0'/0/0
     *
     * TODO: [tests, moderate] units required
     * @returns {string} trx address string
     */
    static getCurrentTrxAddress() {
        try {
            const network = Storage.getCurrentNetwork(Coins.COINS.TRX);
            const accountsData = Storage.getAccountsData();
            const accountData = accountsData.getAccountData(bip44Scheme, network, 0);
            const publicKey = KeysBip44.generateAddressPublicKeyByAccountPublicKey(accountData);
            return this._calculateAddressByPublicKey(publicKey);
        } catch (e) {
            improveAndRethrow(e, "getCurrentTrxAddress");
        }
    }

    /**
     * Calculates address and private key for current trx wallet default derivation path
     *
     * @param password {string} password of current wallet
     * @return {[{privateKey: string, address: string}]}
     */
    static exportAddressesWithPrivateKeys(password) {
        try {
            const ethNetwork = Storage.getCurrentNetwork(Coins.COINS.TRX);
            const { mnemonic, passphrase } = AuthService.getDecryptedWalletCredentials(password);
            const { publicKey, privateKey } = KeysBip44.generateKeysForAccountAddressByWalletCredentials(
                mnemonic,
                passphrase,
                ethNetwork
            );

            const address = this._calculateAddressByPublicKey(publicKey);

            return [{ address: address, privateKey: privateKey.toString("hex") }];
        } catch (e) {
            improveAndRethrow(e, "exportAddressesWithPrivateKeys");
        }
    }

    static _calculateAddressByPublicKey(publicKey) {
        try {
            const ethAddress = ethers.utils.computeAddress(publicKey).slice(2);
            const buffer = Buffer.from(ethAddress, "hex");
            return bitcoinJs.address.toBase58Check(buffer, 0x41);
        } catch (e) {
            improveAndRethrow(e, "_calculateAddressByPublicKey");
        }
    }
}
