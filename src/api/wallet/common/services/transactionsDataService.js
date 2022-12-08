import { decrypt, encrypt, getSaltedHash } from "../../../common/adapters/crypto-utils";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { getDataPassword } from "../../../common/services/internal/storage";
import { TransactionDataApi } from "../backend-api/transactionDataApi";
import { Logger } from "../../../support/services/internal/logs/logger";

export class TransactionsDataService {
    /**
     * Saves given data for transaction id (for current wallet recognized by cookies).
     * Hashes transaction id with salt (data password available only in specific client's browser) to protect from
     * recognition of real transaction id.
     *
     * Also encrypts transaction data with dataPassword. It protects us from stole of data from server.
     *
     * @param transactionId - id of transaction to save data for
     * @param data - transactions data, format: { note: "note_string" }
     * @returns Promise resolving to nothing
     */
    static async saveTransactionData(transactionId, data) {
        const loggerSource = "saveTransactionData";
        try {
            Logger.log(`Start saving tx data for ${transactionId}`, loggerSource);

            const dataPassword = getDataPassword();
            const transactionIdHash = getSaltedHash(transactionId, dataPassword);
            const encryptedNote = encrypt(data.note, dataPassword);
            const transactionsData = { encryptedNote };

            await TransactionDataApi.saveTransactionDataToServerForCurrentWallet(transactionIdHash, transactionsData);

            Logger.log(`Tx data was saved ${transactionId}`, loggerSource);
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Gets encrypted transactions data from server, decrypts it and returns (for current wallet recognized by cookies).
     *
     * @param transactionIds - ids of transactions to get from
     * @returns Promise resolving to [ { transactionId: "id_string", note: "note_string" }, ... ]
     */
    static async getTransactionsData(transactionIds) {
        try {
            const dataPassword = getDataPassword();
            const transactionIdHashesMapping = transactionIds.map(transactionId => {
                return { transactionId, transactionIdHash: getSaltedHash(transactionId, dataPassword) };
            });
            const transactionIdHashes = transactionIdHashesMapping.map(entry => entry.transactionIdHash);

            const encryptedTransactionsData = await TransactionDataApi.getTransactionsDataFromServerForCurrentWallet(
                transactionIdHashes
            );

            return encryptedTransactionsData.map(dataEntry => {
                const { transactionId } = transactionIdHashesMapping.filter(
                    mapEntry => mapEntry.transactionIdHash === dataEntry.transactionIdHash
                )[0];
                return { transactionId, note: decrypt(dataEntry.encryptedNote, dataPassword) };
            });
        } catch (e) {
            improveAndRethrow(e, "getTransactionsData");
        }
    }

    /**
     * Updates transaction data on server for current wallet.
     *
     * @param transactionId - id of transaction to update data for
     * @param data - data to be pushed, format: { note: "note_string" }
     * @returns Promise resolving to null if given ids are not found, update result otherwise:
     *   { transactionId: "id_string", note: "note_string" }
     */
    static async updateTransactionData(transactionId, data) {
        const loggerSource = "updateTransactionData";
        try {
            Logger.log(`Start updating for ${transactionId}`, loggerSource);

            const dataPassword = getDataPassword();
            const transactionIdHash = getSaltedHash(transactionId, dataPassword);
            const encryptedNote = encrypt(data.note, dataPassword);
            const transactionData = { encryptedNote };
            const updateResult = await TransactionDataApi.updateTransactionDataOnServerForCurrentWallet(
                transactionIdHash,
                transactionData
            );

            if (updateResult === "not_found") {
                Logger.log(`Tx not found on server ${transactionId}. Returning null`, loggerSource);

                return null;
            }

            Logger.log(`Tx data was updated ${transactionId}`, loggerSource);
            return { transactionId, note: decrypt(updateResult.encryptedNote, dataPassword) };
        } catch (e) {
            improveAndRethrow(e, TransactionsDataService.updateTransactionData);
        }
    }
}
