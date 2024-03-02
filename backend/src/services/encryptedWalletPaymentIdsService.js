import log4js from "log4js";

import { improveAndRethrow } from "@rabbitio/ui-kit";

import { dbConnectionHolder } from "../utils/dbConnectionHolder.js";
import { isFindAndUpdateOneResultValid } from "./mongoUtil.js";

const log = log4js.getLogger("encryptedWalletPaymentIdsService");

export class EncryptedWalletPaymentIdsService {
    static dbCollectionName = "encryptedWalletPaymentIds";

    static async saveEncryptedWalletPaymentId(walletId, encryptedPaymentId) {
        try {
            log.debug(`Start saving the encrypted payment id for walletId: ${walletId}`);
            const collection = await dbConnectionHolder.getCollection(this.dbCollectionName);

            const result = await collection.findOneAndUpdate(
                { wId: walletId },
                { $push: { ePIds: encryptedPaymentId } },
                { returnOriginal: false, upsert: true }
            );

            if (!isFindAndUpdateOneResultValid(result, false)) {
                log.debug(`Failed to save encrypted payment id for ${walletId}. Details: ${JSON.stringify(result)}`);
                throw new Error(`Failed to save encrypted payment id for wallet id ${walletId}`);
            }

            log.debug(`Encrypted payment id ${walletId} for wallet id was saved successfully.`);
        } catch (e) {
            improveAndRethrow(e, "saveEncryptedWalletPaymentId");
        }
    }

    static async getListOfEncryptedWalletPaymentIds(walletId) {
        try {
            log.debug(`Start getting a list of encrypted payment ids for wallet id: ${walletId}`);
            const collection = await dbConnectionHolder.getCollection(this.dbCollectionName);
            const result = await collection.findOne({ wId: walletId });

            if (result && result.ePIds && result.ePIds.length) {
                log.debug(`Successfully got ${result.ePIds.length} encrypted payment ids for walletId ${walletId}`);
                return result.ePIds;
            }

            log.debug(`No encrypted payment ids found for walletId: ${walletId}. Returning empty array`);
            return [];
        } catch (e) {
            improveAndRethrow(e, "getListOfEncryptedWalletPaymentIds");
        }
    }
}
