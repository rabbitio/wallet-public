import {getLogger} from "log4js";

import {deleteExistingDocuments} from "./mongoUtil";
import {improveAndRethrow} from "../utils/utils";
import {dbConnectionHolder} from "../utils/dbConnectionHolder";


const log = getLogger("encryptedInvoicesService");
const encryptedInvoicesCollectionName = "encryptedInvoices";

export default class EncryptedInvoicesService {
    static async saveEncryptedInvoice(walletId, invoiceUuid, encryptedInvoiceData) {
        log.debug("Start saving encrypted Invoice. ");
        try {
            const encryptedInvoices = await dbConnectionHolder.getCollection(encryptedInvoicesCollectionName);
            await deleteExistingDocuments({ walletId, invoiceUuid, encryptedInvoiceData }, encryptedInvoices);
            const result = await encryptedInvoices.insertOne({ walletId, invoiceUuid, encryptedInvoiceData });
            if (result.insertedCount === 1) {
                log.debug("Encrypted Invoice data has been successfully saved. Returning its document.");
                return await encryptedInvoices.findOne({ walletId, invoiceUuid });
            } else {
                throw new Error("Failed to save encrypted Invoice data. ");
            }
        } catch (e) {
            improveAndRethrow(e, "saveEncryptedInvoice");
        }
    }

    static async getEncryptedInvoices(walletId, invoicesUuids) {
        log.debug("Start getting all encrypted Invoices.");

        try {
            const encryptedInvoicesCollection = await dbConnectionHolder.getCollection(encryptedInvoicesCollectionName);
            const criteria = { walletId };
            invoicesUuids && invoicesUuids.length && (criteria["invoiceUuid"] = { $in: invoicesUuids } );
            const encryptedInvoicesDocuments = await encryptedInvoicesCollection.find(criteria).toArray();

            if (!encryptedInvoicesDocuments || !encryptedInvoicesDocuments.length) {
                log.debug("Encrypted Invoices have not been found. Returning empty array.");
                return [];
            }

            const pureInvoices = encryptedInvoicesDocuments.map(invoiceDocument => invoiceDocument.encryptedInvoiceData);

            log.debug(`End. Returning ${pureInvoices.length} encrypted Invoices sorted descending by creation date. `);
            return pureInvoices;
        } catch (e) {
            improveAndRethrow(e, "getEncryptedInvoices");
        }
    }

    static async deleteSpecificEncryptedInvoices(walletId, invoicesUuids) {
        log.debug(`Start deletion of ${invoicesUuids.length} encrypted Invoices.`);

        await deleteEncryptedInvoices({ walletId, invoiceUuid: { $in: invoicesUuids } });
    }

    static async deleteAllEncryptedInvoices(walletId) {
        log.debug(`Start deletion of all encrypted Invoices for wallet.`);

        await deleteEncryptedInvoices({ walletId });
    }

}

async function deleteEncryptedInvoices(criteria) {
    try {
        const encryptedInvoicesCollection = await dbConnectionHolder.getCollection(encryptedInvoicesCollectionName);

        await encryptedInvoicesCollection.deleteMany(criteria);

        log.debug("Checking that encrypted Invoices have been deleted.");
        const notRemovedEncryptedInvoices = await encryptedInvoicesCollection.find(criteria).toArray();

        if (notRemovedEncryptedInvoices && notRemovedEncryptedInvoices.length) {
            throw new Error(`Not all desired encrypted Invoices have been deleted. Not removed count is ${notRemovedEncryptedInvoices.length}. `);
        }

        log.debug("Encrypted Invoices have been successfully deleted.");
    } catch (e) {
        improveAndRethrow(e, "deleteEncryptedInvoices");
    }
}
