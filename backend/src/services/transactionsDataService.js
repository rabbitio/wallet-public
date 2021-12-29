import {getLogger} from "log4js";
import {improveAndRethrow} from "../utils/utils";
import {dbConnectionHolder} from "../utils/dbConnectionHolder";
import {deleteExistingDocuments, isUpdateOneResultValid} from "./mongoUtil";


const log = getLogger("transactionsDataService");

export class TransactionsDataService {
    static async saveTransactionData(walletId, transactionIdHash, encryptedNote) {
        log.debug("Start saving transaction data");
        try {
            const transactionsData = await dbConnectionHolder.getCollection("transactionsData");

            await deleteExistingDocuments({ walletId, transactionIdHash }, transactionsData);

            const document = { walletId, transactionIdHash, encryptedNote };
            const result = await transactionsData.insertOne(document);
            if (result.insertedCount === 1) {
                log.debug("Transaction data has been successfully saved. Returning saved document.");
                return await transactionsData.findOne({ transactionIdHash });
            } else {
                throw new Error("Failed to save transaction data - inserted count not equal to 1.");
            }
        } catch (e) {
            improveAndRethrow(e, "saveTransactionData");
        }
    }

    static async getTransactionsData(walletId, transactionIdHashes) {
        log.debug("Start getting transaction data.");
        const hashes = transactionIdHashes.split(",");
        if (!hashes.length) {
            return [];
        }

        try {
            const transactionsDataCollection = await dbConnectionHolder.getCollection("transactionsData");
            const transactionsData = await transactionsDataCollection.find({ walletId, transactionIdHash: { $in: hashes } }).toArray();

            if (!transactionsData) {
                log.debug("Transaction data has not been found.");
                return null;
            }

            return transactionsData.map(entry => {
                return { transactionIdHash: entry.transactionIdHash, encryptedNote: entry.encryptedNote };
            });
        } catch (e) {
            improveAndRethrow(e, "getTransactionsData");
        }
    }

    static async updateTransactionData(walletId, transactionIdHash, encryptedNote) {
        log.debug("Start updating transaction data.");
        try {
            const transactionsDataCollection = await dbConnectionHolder.getCollection("transactionsData");
            const updateOneResult = await transactionsDataCollection.updateOne(
                { walletId, transactionIdHash },
                { $set: { encryptedNote } }
            );

            if (!isUpdateOneResultValid(updateOneResult, true)) {
                throw new Error(`Failed to update transaction data: ${JSON.stringify(updateOneResult)}`);
            }

            log.debug("Updated successfully. Returning updated document.");
            const updated = await transactionsDataCollection.find({ walletId, transactionIdHash }).toArray();
            return { transactionIdHash: updated[0].transactionIdHash, encryptedNote: updated[0].encryptedNote };
        } catch (e) {
            improveAndRethrow(e, "updateTransactionData");
        }
    }

    static async removeAllTransactionsDataForWallet(walletId) {
        log.debug("Start removing all transaction data for wallet.");
        try {
            const transactionsDataCollection = await dbConnectionHolder.getCollection("transactionsData");
            await transactionsDataCollection.deleteMany({ walletId });

            const notRemovedCount = (await transactionsDataCollection.find({ walletId }).toArray()).length;
            if (notRemovedCount) {
                throw new Error(`Not all transaction data documents have been removed by wallet id, remains ${notRemovedCount}. `);
            }
            log.debug("All transactions data documents have been successfully removed for given walletId. Call finished.");
        } catch (e) {
            improveAndRethrow(e, "removeAllTransactionsDataForWallet");
        }
    }
}
