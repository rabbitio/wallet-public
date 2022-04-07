import { improveAndRethrow } from "../../utils/errorUtils";
import { EncryptedWalletPaymentIdsApi } from "../../external-apis/backend-api/encryptedWalletPaymentIdsApi";
import { getDataPassword, getWalletId } from "./storage";
import { decrypt, encrypt } from "../../adapters/crypto-utils";
import { Logger } from "./logs/logger";

export class EncryptedWalletPaymentIdsService {
    /**
     * Encrypts payment id on client and saves it on server for current wallet.
     *
     * @param {string} paymentId - payment id to be encrypted and saved
     * @return {Promise<void>}
     */
    static async saveNewPaymentIdForCurrentWallet(paymentId) {
        const loggerSource = "saveNewPaymentIdForCurrentWallet";
        try {
            Logger.log(`Start saving new payment id: ${paymentId}`, loggerSource);

            const encryptedId = encrypt(paymentId, getDataPassword());
            await EncryptedWalletPaymentIdsApi.saveEncryptedWalletPaymentId(getWalletId(), encryptedId);

            Logger.log(`New payment id was saved: ${paymentId}`, loggerSource);
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Retrieves all encrypted payment ids for current wallet and decrypts them and return
     *
     * @return {Promise<Array<string>>} - an array of all payment ids related to current wallet (decrypted)
     */
    static async getPaymentIdsForCurrentWallet() {
        try {
            const encryptedIdsArray = await EncryptedWalletPaymentIdsApi.getAllEncryptedWalletPaymentIds(getWalletId());
            const decryptedIds = encryptedIdsArray.map(encryptedId => decrypt(encryptedId, getDataPassword()));

            return decryptedIds;
        } catch (e) {
            improveAndRethrow(e, "getPaymentIdsForCurrentWallet");
        }
    }
}
