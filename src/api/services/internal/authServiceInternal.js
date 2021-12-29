import { getEncryptedWalletCredentials } from "./storage";
import { decrypt } from "../../adapters/crypto-utils";
import { improveAndRethrow } from "../../utils/errorUtils";

export function getDecryptedWalletCredentials(password) {
    try {
        const encryptedWalletCredentials = getEncryptedWalletCredentials();
        return {
            mnemonic: decrypt(encryptedWalletCredentials.encryptedMnemonic, password),
            passphrase: decrypt(encryptedWalletCredentials.encryptedPassphrase, password),
        };
    } catch (e) {
        improveAndRethrow(e, "getDecryptedWalletCredentials");
    }
}
