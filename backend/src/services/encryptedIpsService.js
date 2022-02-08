import { getLogger } from "log4js";

import { deleteExistingDocuments } from "./mongoUtil";
import { improveAndRethrow } from "../utils/utils";
import { dbConnectionHolder } from "../utils/dbConnectionHolder";

const log = getLogger("encryptedIpsService");
const encryptedIpsCollectionName = "encryptedIps";

export default class EncryptedIpsService {
    static async saveIP(walletId, encryptedIp, ipHash) {
        log.debug("Start saving encryptedIp and its hash. ");
        try {
            const encryptedIps = await dbConnectionHolder.getCollection(encryptedIpsCollectionName);
            await deleteExistingDocuments({ walletId, ipHash }, encryptedIps);
            const result = await encryptedIps.insertOne({ walletId, encryptedIp, ipHash, creationDate: new Date() });
            if (result.insertedCount === 1) {
                log.debug("Encrypted IP data has been successfully saved. Returning its document.");
                return await encryptedIps.findOne({ walletId, encryptedIp, ipHash });
            } else {
                throw new Error("Failed to save encrypted IP data. ");
            }
        } catch (e) {
            improveAndRethrow(e, "saveIP");
        }
    }

    static async getAllEncryptedIPs(walletId) {
        log.debug("Start getting all encrypted IPs.");

        try {
            const encryptedIpsCollection = await dbConnectionHolder.getCollection(encryptedIpsCollectionName);
            const encryptedIpsDocuments = await encryptedIpsCollection
                .find({ walletId })
                .sort({ creationDate: -1 })
                .toArray();

            if (!encryptedIpsDocuments || !encryptedIpsDocuments.length) {
                log.debug("Encrypted IPs have not been found. Returning empty array.");
                return [];
            }

            const pureIps = encryptedIpsDocuments.map(ipDocument => ipDocument.encryptedIp);

            log.debug(`End. Returning ${pureIps.length} encrypted IPs sorted descending by creation date. `);
            return pureIps;
        } catch (e) {
            improveAndRethrow(e, "getAllEncryptedIPs");
        }
    }

    static async deleteEncryptedIps(walletId, ipHashesToDelete) {
        log.debug(`Start deletion of ${ipHashesToDelete.length} encrypted IPs.`);

        try {
            const encryptedIpsCollection = await dbConnectionHolder.getCollection(encryptedIpsCollectionName);

            await encryptedIpsCollection.deleteMany({ walletId, ipHash: { $in: ipHashesToDelete } });

            log.debug("Checking that encrypted IPs have been deleted.");
            const notRemovedEncryptedIps = await encryptedIpsCollection
                .find({ walletId, ipHash: { $in: ipHashesToDelete } })
                .toArray();

            if (notRemovedEncryptedIps && notRemovedEncryptedIps.length === ipHashesToDelete.length) {
                throw new Error("No encrypted IPs have been deleted. ");
            } else if (notRemovedEncryptedIps && notRemovedEncryptedIps.length) {
                throw new Error(
                    `Not all encrypted IPs have been deleted. Deleted count: ${ipHashesToDelete.length -
                        notRemovedEncryptedIps.length}. `
                );
            }

            log.debug("Encrypted IPs have been successfully deleted.");
        } catch (e) {
            improveAndRethrow(e, "deleteEncryptedIps");
        }
    }

    static async deleteAllEncryptedIpsForWallet(walletId) {
        log.debug("Start deletion of encrypted IPs for wallet.");

        try {
            const encryptedIpsCollection = await dbConnectionHolder.getCollection(encryptedIpsCollectionName);

            log.debug("Getting encrypted IPs to be removed.");
            const ipsToBeRemoved = await encryptedIpsCollection.find({ walletId }).toArray();

            log.debug(`Got ${ipsToBeRemoved.length} encrypted IPs to be removed. Removing.`);
            await encryptedIpsCollection.deleteMany({ walletId });

            log.debug("Checking that encrypted IPs have been deleted.");
            const notRemovedEncryptedIps = await encryptedIpsCollection.find({ walletId }).toArray();

            if (notRemovedEncryptedIps && notRemovedEncryptedIps.length) {
                throw new Error(
                    `Not all encrypted IPs have been deleted. Remains ${notRemovedEncryptedIps.length} items of ${ipsToBeRemoved.length} that should be deleted. `
                );
            }

            log.debug("Encrypted IPs have been successfully deleted.");
        } catch (e) {
            improveAndRethrow(e, "deleteAllEncryptedIpsForWallet");
        }
    }

    static async isIpHashWhitelisted(walletId, ipHash) {
        log.debug("Start checking whether ip whitelisted.");

        try {
            const encryptedIpsCollection = await dbConnectionHolder.getCollection(encryptedIpsCollectionName);

            const allEncryptedIpsForWallet = await encryptedIpsCollection.find({ walletId }).toArray();

            if (!allEncryptedIpsForWallet.length) {
                log.debug("There are no encrypted IPs saved, returning true.");
                return true; // All are whitelisted if there are no IPs saved
            }

            const encryptedIpsDocuments = await encryptedIpsCollection.find({ walletId, ipHash }).toArray();

            log.debug(`Search has been done. Returning ${encryptedIpsDocuments.length > 0}`);
            return encryptedIpsDocuments.length > 0;
        } catch (e) {
            improveAndRethrow(e, "isIpHashWhitelisted");
        }
    }
}
