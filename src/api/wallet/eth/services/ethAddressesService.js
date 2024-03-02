import { ethers } from "ethers";

import { improveAndRethrow } from "@rabbitio/ui-kit";

import { bip44Scheme } from "../../btc/lib/addresses-schemes.js";
import { Storage } from "../../../common/services/internal/storage.js";
import { Coins } from "../../coins.js";
import { AuthService } from "../../../auth/services/authService.js";
import { KeysBip44 } from "../../common/lib/keysBip44.js";

export class EthAddressesService {
    /**
     * Retrieves ethereum address for current wallet. Derivation path: m/44'/60'/0'/0/0
     *
     * @returns {string} ethereum address string
     */
    static getCurrentEthAddress() {
        try {
            const ethNetwork = Storage.getCurrentNetwork(Coins.COINS.ETH);
            const accountsData = Storage.getAccountsData();
            const accountData = accountsData.getAccountData(bip44Scheme, ethNetwork, 0);
            const publicKey = KeysBip44.generateAddressPublicKeyByAccountPublicKey(accountData);

            return ethers.utils.computeAddress(publicKey).toLowerCase();
        } catch (e) {
            improveAndRethrow(e, "getCurrentEthAddress");
        }
    }

    /**
     * Calculates address and private key for current ether wallet default derivation path
     *
     * @param password {string} password of current wallet
     * @return {[{privateKey: string, address: string}]}
     */
    static exportAddressesWithPrivateKeys(password) {
        try {
            const ethNetwork = Storage.getCurrentNetwork(Coins.COINS.ETH);
            const { mnemonic, passphrase } = AuthService.getDecryptedWalletCredentials(password);
            const { publicKey, privateKey } = KeysBip44.generateKeysForAccountAddressByWalletCredentials(
                mnemonic,
                passphrase,
                ethNetwork
            );

            const address = ethers.utils.computeAddress(publicKey).toLowerCase();

            return [{ address: address, privateKey: "0x" + privateKey.toString("hex") }];
        } catch (e) {
            improveAndRethrow(e, "exportAddressesWithPrivateKeys");
        }
    }
}
