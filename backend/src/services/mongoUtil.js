import log4js from "log4js";

import { improveAndRethrow } from "@rabbitio/ui-kit";

import { DB_NAME } from "../properties.js";

const log = log4js.getLogger("mongoUtils");

export async function deleteExistingDocuments(criteria, mongoDbCollection) {
    log.debug(
        `Start deleting existing documents by criteria: ${JSON.stringify(
            criteria
        )} from collection: ${mongoDbCollection}`
    );

    const existing = await mongoDbCollection.find(criteria).toArray();
    if (existing.length > 0) {
        await mongoDbCollection.remove(criteria);
        const notRemoved = await mongoDbCollection.find(criteria).toArray();
        if (notRemoved && notRemoved.length) {
            throw new Error("Failed to remove existing documents. ");
        }
        log.debug("Existing documents have been deleted. ");
    }
}

export function isUpdateOneResultValid(updateOneResult, isChangesCanBeRedundant = false) {
    // We are not checking upserting here as it is disabled by default
    return (
        updateOneResult &&
        updateOneResult.matchedCount === 1 &&
        updateOneResult.result.ok &&
        updateOneResult.result.n === 1 &&
        (isChangesCanBeRedundant || (updateOneResult.modifiedCount === 1 && updateOneResult.result.nModified === 1))
    );
}

export function isFindAndUpdateOneResultValid(findAndUpdateResult, shouldMatch = true) {
    // We are not checking upserting here as it is disabled by default
    return findAndUpdateResult.ok === 1 && (!shouldMatch || findAndUpdateResult.value !== null);
}

export function isFindAndUpdateOneNotMatched(findAndUpdateResult) {
    return findAndUpdateResult.value === null;
}

export function isInsertOneResultValid(insertOneResult) {
    return insertOneResult.result.ok === 1 && insertOneResult.result.n === 1;
}

export function isInsertManyResultValid(insertOneResult, expectedCount) {
    return insertOneResult.result.ok === 1 && insertOneResult.result.n === expectedCount;
}

export function isDeleteManyResultValid(deleteManyResult, shouldBeDeleted = true) {
    return deleteManyResult.result.ok === 1 && (!shouldBeDeleted || deleteManyResult.result.n > 0);
}

export function isPingResultOk(pingResult) {
    return pingResult.ok === 1;
}

/**
 * Checks whether collections with given names are present in db and creates them if not.
 *
 * TODO: [bug, low] This method is not resolving concurrent collection creation so can cause lost update
 * @param client - client of db to check presence in
 * @param collectionNames - names of collections to be checked
 * @returns Promise resolving to nothing
 */
export async function createCollectionsIfNotPresent(client, collectionNames) {
    try {
        log.debug(`Start checking db collections ${collectionNames} presence.`);

        const db = client.db(DB_NAME);
        const collections = (await db.listCollections().toArray()).map(collection => collection.name);

        for (let i = 0; i < collectionNames.length; ++i) {
            if (!collections.find(collection => collection === collectionNames[i])) {
                log.info(`Collection ${collectionNames[i]} is not present, creating.`);
                await db.createCollection(collectionNames[i]);
                log.info(`Collection ${collectionNames[i]} has been created.`);
            } else {
                log.debug(`Collection ${collectionNames[i]} is present.`);
            }
        }
        log.debug("Collections creation has been finished.");
    } catch (e) {
        improveAndRethrow(e, "createCollectionsIfNotPresent");
    }
}
