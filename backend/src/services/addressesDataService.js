import log4js from "log4js";

import { improveAndRethrow } from "@rabbitio/ui-kit";

import { dbConnectionHolder } from "../utils/dbConnectionHolder.js";
import {
    isDeleteManyResultValid,
    isFindAndUpdateOneNotMatched,
    isFindAndUpdateOneResultValid,
    isInsertOneResultValid,
} from "./mongoUtil.js";

const log = log4js.getLogger("AddressesDataService");

export const addressesDataDbCollectionName = "addressesData";

export default class AddressesDataService {
    /**
     * Initializes addressData document for new wallet - sets provided initial indexes and addresses data.
     *
     * @param walletId - id of wallet to store data for
     * @param initialIndexesData - initial indexes data to be stored
     * @param initialAddressesData - initial addresses data to be stored
     * @param dbSession - session with active transaction to ensure the atomicity of whole wallet creation process
     * @returns Promise resolving to nothing
     *
     * @throws Error if insert operation fails
     */
    static async initializeAddressesDocumentForNewWallet(
        walletId,
        initialIndexesData,
        initialAddressesData,
        dbSession
    ) {
        try {
            const addressesDataCollection = await dbConnectionHolder.getCollection(addressesDataDbCollectionName);
            const insertOneResult = await addressesDataCollection.insertOne(
                {
                    walletId,
                    indexes: initialIndexesData,
                    data: initialAddressesData,
                },
                { session: dbSession }
            );

            if (!isInsertOneResultValid(insertOneResult)) {
                throw new Error(`Failed to insert initial addressesData: ${JSON.stringify(insertOneResult)}.`);
            }

            log.debug("Initial addresses data for given walletId has been successfully inserted.");
        } catch (e) {
            improveAndRethrow(e, "initializeAddressesDocumentForNewWallet");
        }
    }

    /**
     * Returns array of mappings of address node path to index
     *
     * @param walletId - id of wallet to get indexes for
     * @returns Promise resolving to Array of addressIndexes [ { path: not empty string, index: number >=0 }, ... ]
     * @throws Error if no data entry found for given wallet id - we always create it during the wallet creation so expect it also always
     */
    static async getAddressesIndexes(walletId) {
        log.debug("Start getting address indexes.");

        try {
            const addressesCollection = await dbConnectionHolder.getCollection(addressesDataDbCollectionName);
            const addressData = await addressesCollection.findOne({ walletId });

            if (!addressData) {
                throw new Error(`No entry for walletId ${walletId} present in db. It is not expected.`);
            }

            if (!addressData.indexes || !Array.isArray(addressData.indexes)) {
                throw new Error("No indexes data or it is not an array. It is not expected. ");
            }

            log.debug("Returning indexes data. ");
            return addressData.indexes.map(indexData => {
                return { path: indexData.p, index: indexData.i };
            });
        } catch (e) {
            improveAndRethrow(e, "getAddressesIndexes");
        }
    }

    /**
     * Retrieves addresses data for addresses of given wallet
     *
     * @param walletId - id of wallet to select addresses for
     * @returns Promise resolving to Array of address data items { uuid: string, encryptedAddressData: string }
     *
     * @throws Error if no data entry found for given wallet id - we always create it during the wallet creation so expect it also always
     * @throws Error if addresses data list for given walletId is absent or not array
     */
    static async getAddressesData(walletId) {
        try {
            log.debug("Start getting addresses data.");
            const addressesDataCollection = await dbConnectionHolder.getCollection(addressesDataDbCollectionName);
            const addressesData = await addressesDataCollection.findOne({ walletId });

            if (!addressesData) {
                throw new Error(`No entry for walletId ${walletId} present in db. It is not expected.`);
            }

            if (!addressesData.data || !Array.isArray(addressesData.data)) {
                throw new Error(
                    `No addressesData or it is not an array. It is not expected. ${addressesData && addressesData.data}`
                );
            }

            log.debug("Returning addresses data list.");
            return addressesData.data.map(addressData => ({
                uuid: addressData.h,
                encryptedAddressData: addressData.encData,
            }));
        } catch (e) {
            improveAndRethrow(e, "getAddressesData");
        }
    }

    /**
     * Updates index of address by provided path and pushes given addresses data.
     *
     * This operation is robust in terms of concurrent requests as we update index only if it is greater than the
     * current index. But it saves all given addresses data what can cause duplicated data - this should be handled
     * when the data is being retrieved.
     *
     * @param walletId - id of wallet
     * @param path - path of given addresses to update index for
     * @param addressesDataMapping - addresses data array - [ { uuid: not empty string, encryptedAddressesData: not empty string }, ... ]
     *        There are possibly duplicated saved addresses data in the DB caused by this method as we cannot check
     *        for what exact address the data is being saved. It is as we save encrypted data. So you should take care
     *        about deduplicating decrypted data by yourself when retrieving the data
     * @param baseIndex - index to add length of given addresses data list to
     * @returns Promise resolving to nothing
     *
     * @throws Error if no data entry found for given wallet id - we always create it during the wallet creation so expect it also always
     * @throws Error if result of update is matched but not valid
     */
    // TODO: [tests, critical] implement unit tests due to sophisticated logic
    static async saveAddressesDataAndUpdateAddressIndexByPath(walletId, path, addressesDataMapping, baseIndex) {
        log.debug("Start updating of addressIndex and saving addresses data.");

        try {
            const addressesDataCollection = await dbConnectionHolder.getCollection(addressesDataDbCollectionName);
            const newIndex = baseIndex + addressesDataMapping.length;
            log.debug(`Updating to new index ${newIndex} and pushing ${addressesDataMapping.length} data items.`);

            await findOneSavedAddressesDataDocAndUpdate(
                addressesDataCollection,
                walletId,
                addressesDataMapping,
                path,
                newIndex
            );

            log.debug("Address index has been updated successfully and address data pushed");
        } catch (e) {
            improveAndRethrow(e, "saveAddressesDataAndUpdateAddressIndexByPath");
        }
    }

    /**
     * Updates index of address by provided path
     *
     * @param walletId - id of wallet to update index for
     * @param path - a path to update index for
     * @param newIndex - new index value
     * @returns Promise resolving to nothing
     *
     * @throws Error if no data entry found for given wallet id - we always create it during the wallet creation so expect it also always
     * @throws Error if result of update is matched but not valid
     */
    // TODO: [tests, moderate] Implement unit and integration tests due to sophisticated logic
    static async updateAddressIndex(walletId, path, newIndex) {
        log.debug("Start updating address index.");

        try {
            const addressesDataCollection = await dbConnectionHolder.getCollection(addressesDataDbCollectionName);
            await findOneSavedAddressesDataDocAndUpdate(addressesDataCollection, walletId, null, path, newIndex);

            log.debug("Address index was successfully updated.");
        } catch (e) {
            improveAndRethrow(e, "updateAddressIndex");
        }
    }

    /**
     * Removes address data from list of address data of specific wallet. Throws error if the address is not present
     *
     * @param walletId - id of wallet to remove address for
     * @param uuid - uuid of address to remove data for
     * @returns Promise resolving to nothing
     *
     * @throws Error if no data entry found for given wallet id - we always create it during the wallet creation so expect it also always
     * @throws Error if result of update is matched but not valid
     */
    static async removeAddressData(walletId, uuid) {
        try {
            log.debug("Start removing address data by given uuid and walletId.");
            const addressesDataCollection = await dbConnectionHolder.getCollection(addressesDataDbCollectionName);

            const findOneAndUpdateResult = await addressesDataCollection.findOneAndUpdate(
                { walletId, data: { $elemMatch: { h: uuid } } },
                { $pull: { data: { h: uuid } } }
            );

            if (
                isFindAndUpdateOneNotMatched(findOneAndUpdateResult) &&
                !(await isEntryPresentForWalletId(walletId, addressesDataCollection))
            ) {
                throw new Error(`No entry for walletId ${walletId} present in db. It is not expected.`);
            }

            if (!isFindAndUpdateOneResultValid(findOneAndUpdateResult, false)) {
                throw new Error(
                    `Failed to remove address by its uuid. Details of findOneAndUpdate: ${JSON.stringify(
                        findOneAndUpdateResult
                    )}. `
                );
            }

            log.debug("Address data has been successfully removed.");
        } catch (e) {
            improveAndRethrow(e, "removeAddressData");
        }
    }

    /**
     * Updates address data for specific wallet
     *
     * @param walletId - id of wallet to remove address for
     * @param uuid - uuid of address to be removed
     * @param addressData - new addressData
     * @returns Promise resolving to nothing
     *
     * @throws Error if no data entry found for given wallet id - we always create it during the wallet creation so expect it also always
     * @throws Error if result of update is not matched or not valid
     */
    static async updateAddressData(walletId, uuid, addressData) {
        try {
            log.debug("Start updating address data by given uuid and walletId.");
            const addressesDataCollection = await dbConnectionHolder.getCollection(addressesDataDbCollectionName);

            const findOneAndUpdateResult = await addressesDataCollection.findOneAndUpdate(
                { walletId, "data.h": uuid },
                { $set: { "data.$.encData": addressData } }
            );

            if (
                isFindAndUpdateOneNotMatched(findOneAndUpdateResult) &&
                !(await isEntryPresentForWalletId(walletId, addressesDataCollection))
            ) {
                throw new Error(`No entry for walletId ${walletId} present in db. It is not expected.`);
            }

            if (!isFindAndUpdateOneResultValid(findOneAndUpdateResult, true)) {
                throw new Error(
                    `Failed to update address data. Details of findOneAndUpdate: ${findOneAndUpdateResult}. `
                );
            }

            log.debug("Address data has been successfully updated.");
        } catch (e) {
            improveAndRethrow(e, "removeAddress");
        }
    }

    /**
     * Removes all addresses data for specific wallet. Useful for wallet deletion process
     *
     * @param walletId - id of wallet to delete addresses data for
     * @returns Promise resolving to nothing
     *
     * @throws Error if the result of delete many is not valid
     */
    static async removeAllAddressesData(walletId) {
        try {
            log.debug("Start removing addresses data for given walletId.");
            const addressesDataCollection = await dbConnectionHolder.getCollection(addressesDataDbCollectionName);
            const deleteManyResult = await addressesDataCollection.deleteMany({ walletId });

            if (!isDeleteManyResultValid(deleteManyResult)) {
                throw new Error(
                    `Failed to delete addresses data for walletId - wrong result of operation: ${deleteManyResult}. `
                );
            }

            log.debug("Deleted addresses data successfully. End.");
        } catch (e) {
            improveAndRethrow(e, "removeAllAddressesData");
        }
    }
}

async function findOneSavedAddressesDataDocAndUpdate(
    addressesDataCollection,
    walletId,
    addressesDataMappingItems,
    path,
    newIndexValue
) {
    const operationParams = buildFindOneAndUpdateOperationParams(
        walletId,
        addressesDataMappingItems,
        path,
        newIndexValue,
        true
    );
    const findAndModifyResultForEmptyPath = await addressesDataCollection.findOneAndUpdate(...operationParams);

    let findAndUpdateResultForPresentPath = null;
    if (isFindAndUpdateOneNotMatched(findAndModifyResultForEmptyPath)) {
        log.debug("findOneAndUpdate for empty path has not matched so trying for present path.");
        const operation = buildFindOneAndUpdateOperationParams(
            walletId,
            addressesDataMappingItems,
            path,
            newIndexValue
        );
        findAndUpdateResultForPresentPath = await addressesDataCollection.findOneAndUpdate(...operation);

        if (
            isFindAndUpdateOneNotMatched(findAndUpdateResultForPresentPath) &&
            !(await isEntryPresentForWalletId(walletId, addressesDataCollection))
        ) {
            throw new Error(`No entry for walletId ${walletId} present in db. It is not expected.`);
        }
    }

    if (
        !isFindAndUpdateOneResultValid(findAndModifyResultForEmptyPath, false) ||
        (findAndUpdateResultForPresentPath && !isFindAndUpdateOneResultValid(findAndUpdateResultForPresentPath, false))
    ) {
        throw new Error(
            `Failed to update address index ${
                addressesDataMappingItems && `or save addresses data: ${JSON.stringify(addressesDataMappingItems)}`
            }.` +
                `newIndex is ${newIndexValue}. Result for not empty path: ` +
                `${JSON.stringify(findAndUpdateResultForPresentPath)}, for empty path: ` +
                `${JSON.stringify(findAndModifyResultForEmptyPath)}`
        );
    }
}

function buildFindOneAndUpdateOperationParams(
    walletId,
    addressesDataMappingItems,
    path,
    newIndexValue,
    isOnlyForNotPresentPaths = false
) {
    const operationParams = [{ walletId }, {}];
    if (addressesDataMappingItems) {
        /**
         * We need to save some addresses data so we adding corresponding params to the operation here
         *
         * NOTE: we cannot check whether there is the same already saved addresses data.
         * It is because we are storing encrypted data and actual address identification cannot be performed.
         * We can get some duplicated data entries (looking as different ones due to encryption).
         * So this should be processed at the API usages
         */
        operationParams[1]["$push"] = {
            data: {
                $each: addressesDataMappingItems.map(item => ({
                    h: item.uuid,
                    encData: item.encryptedAddressData,
                })),
            },
        };
    }

    if (isOnlyForNotPresentPaths) {
        // Preparing operation params to save index for not yet existing path (in the DB doc)
        operationParams[0]["indexes"] = { $not: { $elemMatch: { p: path } } };
        !operationParams[1]["$push"] && (operationParams[1]["$push"] = {});
        operationParams[1]["$push"]["indexes"] = { p: path, i: newIndexValue };
    } else {
        /**
         * Here we are saving new index for existing path. We check whether new index value is greater than the current
         * one. We do not save new value if it is less than or equal current one. It guaranties that we will not get
         * dirty writes here as we use these operation params in findAndUpdate call.
         */
        operationParams[0]["indexes"] = { $elemMatch: { p: path, i: { $lt: newIndexValue } } };
        operationParams[1]["$set"] = { "indexes.$[element].i": newIndexValue };
        operationParams.push({ arrayFilters: [{ "element.p": { $eq: path } }] });
    }

    return operationParams;
}

async function isEntryPresentForWalletId(walletId, addressesDataCollection) {
    return ((await addressesDataCollection.findOne({ walletId })) && true) || false;
}
