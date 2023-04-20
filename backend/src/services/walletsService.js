import { v4 } from "uuid";
import pbkdf2 from "pbkdf2";
import util from "util";
import { getLogger } from "log4js";

import {
    createCollectionsIfNotPresent,
    isDeleteManyResultValid,
    isFindAndUpdateOneNotMatched,
    isFindAndUpdateOneResultValid,
    isInsertOneResultValid,
    isUpdateOneResultValid,
} from "./mongoUtil";
import EncryptedIpsService from "./encryptedIpsService";
import { improveAndRethrow } from "../utils/utils";
import {
    LOGIN_LOCK_PERIOD_MS,
    MAX_FAILED_LOGIN_ATTEMPTS_COUNT,
    PASSWORD_SALT,
    SESSION_EXPIRATION_TIME,
} from "../properties";
import { dbConnectionHolder } from "../utils/dbConnectionHolder";
import { TransactionsDataService } from "./transactionsDataService";
import EncryptedInvoicesService from "./encryptedInvoicesService";
import AddressesDataService, { addressesDataDbCollectionName } from "./addressesDataService";

const log = getLogger("walletsService");

export const walletsDbCollectionName = "wallets";

export default class WalletsService {
    static async saveNewWalletAndCreateSession(
        walletId,
        passphraseHash,
        passwordHash,
        initialIndexesData,
        initialAddressesData
    ) {
        log.debug("Start saving a new wallet.");

        try {
            const mongoClient = await dbConnectionHolder.getClient();
            await createCollectionsIfNotPresent(mongoClient, [walletsDbCollectionName, addressesDataDbCollectionName]);
            const walletsCollection = await dbConnectionHolder.getCollection(walletsDbCollectionName);

            // Checking of wallet existence is not consistent but it is not critical as creation of wallets with the
            // same walletId has low probability. TODO: [feature, low] The consistency can be improved by use of unique index
            const existingWallet = await walletsCollection.findOne({ walletId });
            if (existingWallet) {
                log.info("Wallet with such phrase already exist, returning null.");
                return null;
            }

            const currentTime = new Date();
            const expirationTime = WalletsService._getSessionExpirationTime();
            const sessionId = v4();

            const passphraseHashSecured = WalletsService._securePasswordHash(passphraseHash);
            const passwordHashSecured = WalletsService._securePasswordHash(passwordHash);

            const session = mongoClient.startSession();
            session.startTransaction({
                readConcern: { level: "majority" },
                writeConcern: { w: "majority" },
                readPreference: "primary",
            });

            try {
                log.debug("Transaction started. Inserting a new wallet.");
                const result = await walletsCollection.insertOne(
                    {
                        walletId,
                        passphraseHashSecured,
                        passwordHashSecured,
                        lastPasswordChangeDate: currentTime,
                        creationTime: currentTime,
                        settings: {
                            currencyCode: null,
                            addressesType: null,
                            lastNotificationsViewTimestamp: Date.now(),
                            showFeeRates: false,
                            doNotRemoveClientLogsWhenSignedOut: false,
                        },
                        sessionId,
                        sessionExpirationTime: expirationTime,
                        failedLoginAttemptsCount: 0,
                        loginBlockedAtTime: null,
                    },
                    { session }
                );

                if (!isInsertOneResultValid(result)) {
                    throw new Error(`Insert one result is not valid: ${result}.`);
                }

                log.debug("Successfully inserted, initializing addresses data.");
                await AddressesDataService.initializeAddressesDocumentForNewWallet(
                    walletId,
                    initialIndexesData,
                    initialAddressesData,
                    session
                );
                log.debug("Addresses Stub has been successfully initialized, committing the transaction.");
                await session.commitTransaction();
                log.debug("Transaction has been successfully committed.");
            } catch (e) {
                try {
                    await session.abortTransaction();
                } catch (e) {
                    log.info("Failed to abort transaction", e);
                }
                throw e;
            } finally {
                session.endSession();
            }

            log.debug("Trying to find saved wallet.");
            const savedWallet = await (await dbConnectionHolder.getCollection(walletsDbCollectionName)).findOne({
                walletId,
            });
            if (!savedWallet) {
                throw new Error("Wallet has been saved saved but not found.");
            }

            log.debug("Saved wallet has been found, returning it. End.");
            return savedWallet;
        } catch (e) {
            improveAndRethrow(e, "saveNewWalletAndCreateSession");
        }
    }

    static _securePasswordHash(passwordHash) {
        return pbkdf2.pbkdf2Sync(passwordHash, Buffer.from(PASSWORD_SALT), 1, 32, "sha512").toString("hex");
    }

    static _getSessionExpirationTime() {
        return new Date(new Date().valueOf() + SESSION_EXPIRATION_TIME);
    }

    static async getWalletData(walletId) {
        log.debug("Start retrieving wallet data");

        try {
            const walletsCollection = await dbConnectionHolder.getCollection(walletsDbCollectionName);
            const wallets = await walletsCollection.find({ walletId }).toArray();
            const wallet = WalletsService._getTheOnlyFoundWallet(wallets);

            if (wallet) {
                log.debug("Wallet was found, return its data.");
                return {
                    walletId,
                    // TODO: [bug, critical] check that not local timestamp task_id=2b9f7ff27b5f4350a3f67368dd35c716
                    creationTime: +wallet.creationTime,
                    lastPasswordChangeDate: +wallet.lastPasswordChangeDate,
                    settings: wallet.settings,
                };
            } else {
                throw new Error(`Wallet was not found: ${walletId}.`);
            }
        } catch (e) {
            improveAndRethrow(e, "getWalletData");
        }
    }

    static async checkWalletSession(walletId, sessionId) {
        log.debug(`Start checking session: ${sessionId}`);

        try {
            const walletsCollection = await dbConnectionHolder.getCollection(walletsDbCollectionName);
            const wallets = await walletsCollection
                .find(
                    {
                        walletId: walletId,
                        sessionId: sessionId,
                    },
                    {
                        sessionId: 1,
                        sessionExpirationTime: 1,
                    }
                )
                .toArray();

            return WalletsService._checkSession(wallets, sessionId);
        } catch (e) {
            improveAndRethrow(e, "checkWalletSession");
        }
    }

    static _checkSession(wallets, sessionId) {
        if (wallets.length === 1) {
            log.debug(`One wallet found with session id: ${sessionId}, returning it's expiration`);
            // TODO: [bug, critical] comparing to local timestamp task_id=2b9f7ff27b5f4350a3f67368dd35c716
            return wallets[0].sessionExpirationTime > new Date() ? "session_valid" : "session_expired";
        } else if (wallets.length > 1) {
            const errorMessage = "There are more then one wallet found for specified sessionId";
            log.debug(errorMessage);
            throw new Error(errorMessage);
        } else {
            log.debug(`Wallet was not found with session id: ${sessionId}`);
            return "session_not_found";
        }
    }

    /**
     * Checks WalletId and password and passphrase and creates session if WalletId & password are valid. Also operates with lock logic
     * when user has failed to input correct password more than fixed number of times.
     *
     * @param walletId
     * @param passphraseHash
     * @param passwordHash
     * @returns Promise resolving to one of objects:
     *   1. WalletId not valid
     *      { result: false, reason: "walletId" }
     *   2. WalletId valid but wallet has active lock
     *      { result: false, reason: "locked", millisecondsToWaitForUnlocking: number }
     *   3. WalletId valid, password invalid, there are attempts remained
     *      { result: false, reason: "password", attemp tsRemained: 2 }
     *   4. WalletId valid, password invalid, there are no attempts remained -> lock
     *      { result: false, reason: "password", lockPeriodMs: <milliseconds to wait for unlocking> }
     *   5. WalletId valid, passphrase invalid
     *      { result: false, reason: "passphrase" }
     *   6. WalletId valid, password valid
     *      { result: true, sessionId: "akjlajflwkj3enad21pwen320fpowe" }
     */
    static async checkPasswordAndCreateSession(walletId, passphraseHash, passwordHash) {
        log.debug("Start checking password and creating a new session");

        try {
            const walletsCollection = await dbConnectionHolder.getCollection(walletsDbCollectionName);
            const wallets = await walletsCollection.find({ walletId: walletId }).toArray();
            const wallet = WalletsService._getTheOnlyFoundWallet(wallets);

            if (wallet) {
                if (WalletsService._isLoginLockActive(wallet)) {
                    log.debug("Login lock is active.");

                    const millisecondsToWaitForUnlocking =
                        +wallet.loginBlockedAtTime + LOGIN_LOCK_PERIOD_MS - Date.now();
                    if (millisecondsToWaitForUnlocking > 0) {
                        log.debug("Login lock is active and not expired. Returning it and the remaining time.");
                        return { result: false, reason: "locked", millisecondsToWaitForUnlocking };
                    }

                    log.debug("Login lock is active and expired - resetting it.");
                    await WalletsService._resetLoginAttemptsCounterAndLock(walletsCollection, wallet);
                }

                const passphraseHashSecured = WalletsService._securePasswordHash(passphraseHash);
                const passwordHashSecured = WalletsService._securePasswordHash(passwordHash);

                if (wallet.passwordHashSecured === passwordHashSecured) {
                    // TODO: [refactoring, low] Use single update here instead of two independent
                    const sessionId = await WalletsService._createNewSessionForWallet(walletsCollection, wallet);
                    await WalletsService._resetLoginAttemptsCounterAndLock(walletsCollection, wallet);
                    if (wallet.passphraseHashSecured === passphraseHashSecured) {
                        log.debug("Login attempts and lock have been reset. Returning success object.");
                        return { result: true, sessionId: sessionId };
                    } else {
                        log.debug("Passphrase is invalid. Returning error object.");
                        return { result: false, reason: "passphrase" };
                    }
                } else {
                    const attemptsRemained = await WalletsService._processWrongPassword(walletsCollection, wallet);
                    if (attemptsRemained > 0) {
                        log.debug("Password is invalid but there is still attempts remained. Returning error object.");
                        return { result: false, reason: "password", attemptsRemained };
                    } else {
                        log.debug(
                            "Password is invalid and there are no more attempts remained, account locked. Returning error object."
                        );
                        return { result: false, reason: "password", lockPeriodMs: LOGIN_LOCK_PERIOD_MS };
                    }
                }
            } else {
                log.info("Wallet was not found, return error object.");
                return { result: false, reason: "walletId" };
            }
        } catch (e) {
            improveAndRethrow(e, "checkPasswordAndCreateSession");
        }
    }

    /**
     * Checks that given passphrase is correct
     *
     * @param walletId - walletId corresponding to passphrase
     * @param passphraseHash - hash of passphrase
     * @return Object { result: true } or { result: false, reason: "walletId" } or { result: false, reason: "passphrase" }
     */
    static async checkPassphrase(walletId, passphraseHash) {
        log.debug("Start checking passphrase");
        try {
            const walletsCollection = await dbConnectionHolder.getCollection(walletsDbCollectionName);
            const wallets = await walletsCollection.find({ walletId }).toArray();
            const wallet = WalletsService._getTheOnlyFoundWallet(wallets);
            if (wallet) {
                log.debug("wallet was found. Checking passphrase.");
                const passphraseHashSecured = WalletsService._securePasswordHash(passphraseHash);
                if (passphraseHashSecured === wallet.passphraseHashSecured) {
                    log.debug("Returning true check result");
                    return { result: true };
                }

                log.debug("Returning false check result");
                return { result: false, reason: "passphrase" };
            } else {
                log.debug("Wallet was not found, returning failed check result");
                return { result: false, reason: "walletId" };
            }
        } catch (e) {
            improveAndRethrow(e, "checkPassphrase");
        }
    }

    /**
     * Checks that given password corresponds to given wallet
     *
     * @param walletId
     * @param passwordHash
     * @returns Promise resolving to Boolean - true if password corresponds to the walletId and false otherwise
     */
    static async checkPassword(walletId, passwordHash) {
        log.debug("Start checking password");

        try {
            const walletsCollection = await dbConnectionHolder.getCollection(walletsDbCollectionName);
            const wallets = await walletsCollection.find({ walletId }).toArray();
            const wallet = WalletsService._getTheOnlyFoundWallet(wallets);

            if (wallet) {
                log.debug("Wallet was found, return password hash check result.");
                const passwordHashSecured = WalletsService._securePasswordHash(passwordHash);
                return wallet.passwordHashSecured === passwordHashSecured;
            } else {
                log.info("Wallet was not found, return error object.");
                return false;
            }
        } catch (e) {
            improveAndRethrow(e, "checkPassword");
        }
    }

    /**
     * Changes password. We are ok if user sets the same password as previous one
     *
     * @param walletId
     * @param passwordHash
     * @param newPasswordHash
     * @returns Promise resolving to nothing
     */
    static async changePassword(walletId, passwordHash, newPasswordHash) {
        log.debug("Start changing password");

        try {
            const walletsCollection = await dbConnectionHolder.getCollection(walletsDbCollectionName);
            const wallets = await walletsCollection.find({ walletId }).toArray();
            const wallet = WalletsService._getTheOnlyFoundWallet(wallets);

            if (wallet) {
                log.debug("Wallet was found, trying to change the password.");
                const passwordHashSecured = WalletsService._securePasswordHash(passwordHash);

                const newPasswordHashSecured = WalletsService._securePasswordHash(newPasswordHash);
                const updateOneResult = await walletsCollection.findOneAndUpdate(
                    { walletId, passwordHashSecured },
                    { $set: { passwordHashSecured: newPasswordHashSecured, lastPasswordChangeDate: new Date() } }
                );

                if (isFindAndUpdateOneNotMatched(updateOneResult)) {
                    return { result: false };
                }

                if (!isFindAndUpdateOneResultValid(updateOneResult, true)) {
                    throw new Error(`Failed to change the password, the result is: ${util.inspect(updateOneResult)}.`);
                }

                return { result: true };
            } else {
                throw new Error(`Wallet was not found: ${walletId}`);
            }
        } catch (e) {
            improveAndRethrow(e, "changePassword");
        }
    }

    /**
     * Saves settings
     *
     * @param walletId - wallet id to save the code for
     * @param settings - settings be saved
     * @returns Promise resolving to nothing
     */
    static async saveSettings(walletId, settings) {
        log.debug("Start saving settings");

        try {
            const walletsCollection = await dbConnectionHolder.getCollection(walletsDbCollectionName);
            const setters = Object.keys(settings).reduce(
                (prev, setting) => ({
                    ...prev,
                    [`settings.${setting}`]: settings[setting],
                }),
                {}
            );
            const updateOneResult = await walletsCollection.findOneAndUpdate({ walletId }, { $set: setters });

            if (!isFindAndUpdateOneResultValid(updateOneResult, true)) {
                throw new Error(`Failed to save settings, the result is: ${util.inspect(updateOneResult)}.`);
            }
            log.debug("Settings have been saved.");
        } catch (e) {
            improveAndRethrow(e, "saveSettings");
        }
    }

    /**
     * Saves lastNotificationsViewTimestamp
     *
     * @param walletId - wallet id to save the code for
     * @param lastNotificationsViewTimestamp - the lastNotificationsViewTimestamp to be saved
     * @returns Promise resolving to nothing
     */
    static async saveLastNotificationsViewTimestamp(walletId, lastNotificationsViewTimestamp) {
        log.debug("Start saving lastNotificationsViewTimestamp");

        try {
            const walletsCollection = await dbConnectionHolder.getCollection(walletsDbCollectionName);
            const updateOneResult = await walletsCollection.findOneAndUpdate(
                { walletId },
                { $set: { lastNotificationsViewTimestamp } }
            );

            if (!isFindAndUpdateOneResultValid(updateOneResult, true)) {
                throw new Error(
                    "Failed to save the lastNotificationsViewTimestamp, the result is: " + util.inspect(updateOneResult)
                );
            }
            log.debug("lastNotificationsViewTimestamp has been saved.");
        } catch (e) {
            improveAndRethrow(e, "saveLastNotificationsViewTimestamp");
        }
    }

    static _getTheOnlyFoundWallet(wallets) {
        if (wallets.length === 1) {
            log.debug("One wallet found.");
            return wallets[0];
        } else if (wallets.length > 1) {
            const errorMessage = "There are more then one wallet found.";
            log.debug(errorMessage);
            throw new Error(errorMessage);
        } else {
            log.debug("Wallet was not found.");
            return null;
        }
    }

    static _isLoginLockActive(wallet) {
        return wallet.loginBlockedAtTime !== null && Date.now() - +wallet.loginBlockedAtTime < LOGIN_LOCK_PERIOD_MS;
    }

    static async _createNewSessionForWallet(walletsCollection, wallet) {
        log.debug("Creating new session for found wallet and valid password.");

        const newSessionId = v4();
        const updateOneResult = await walletsCollection.updateOne(
            { walletId: wallet.walletId },
            { $set: { sessionId: newSessionId, sessionExpirationTime: WalletsService._getSessionExpirationTime() } }
        );

        if (!isUpdateOneResultValid(updateOneResult, false)) {
            throw new Error(`Failed to create new session, result is: ${util.inspect(updateOneResult)}.`);
        }

        log.debug("New session has been created. Returning it.");
        return newSessionId;
    }

    static async _resetLoginAttemptsCounterAndLock(walletsCollection, wallet) {
        const updateResult = await walletsCollection.updateOne(
            { walletId: wallet.walletId },
            { $set: { failedLoginAttemptsCount: 0, loginBlockedAtTime: null } }
        );

        if (!isUpdateOneResultValid(updateResult, true)) {
            throw new Error("Failed to update wallet (wrong result of mongo update). ");
        }
    }

    static async _processWrongPassword(walletsCollection, wallet) {
        log.debug("Start processing wrong password.");
        let update;
        let isExpiredLockPresent = wallet.loginBlockedAtTime;
        if (wallet.failedLoginAttemptsCount + 1 >= MAX_FAILED_LOGIN_ATTEMPTS_COUNT) {
            update = { $set: { failedLoginAttemptsCount: 0, loginBlockedAtTime: new Date() } };
            log.debug("Setting attempts count to 0, lock time to now. ");
        } else {
            update = { $inc: { failedLoginAttemptsCount: 1 } };
            if (isExpiredLockPresent) {
                update["$set"] = { loginBlockedAtTime: null };
            }
            log.debug(
                `Incrementing count of attempts used as current value ${wallet.failedLoginAttemptsCount} is less than ${MAX_FAILED_LOGIN_ATTEMPTS_COUNT}.`
            );
        }

        const updateResult = await walletsCollection.updateOne({ walletId: wallet.walletId }, update);
        if (isUpdateOneResultValid(updateResult, false)) {
            log.debug("Successfully updated wallet, getting updated document.");
            const updatedWallet = (await walletsCollection.find({ walletId: wallet.walletId }).toArray())[0];

            if (updatedWallet.loginBlockedAtTime !== null) {
                log.debug("Returning zero to signal that wallet is locked.");
                return 0;
            } else {
                log.debug("Returning number of attempts remained.");
                return MAX_FAILED_LOGIN_ATTEMPTS_COUNT - updatedWallet.failedLoginAttemptsCount;
            }
        } else {
            throw new Error("Failed to update wallet (wrong result of mongo update). ");
        }
    }

    static async removeSession(sessionId) {
        log.debug("Start removal of session.");

        try {
            const walletCollection = await dbConnectionHolder.getCollection(walletsDbCollectionName);
            const updateResult = await walletCollection.updateOne(
                { sessionId: sessionId },
                { $set: { sessionId: null, sessionExpirationTime: null } }
            );

            if (!isUpdateOneResultValid(updateResult, true)) {
                throw new Error(`Failed to clear session data: ${JSON.stringify(updateResult)}`);
            }

            log.debug("Session was successfully removed");
        } catch (e) {
            improveAndRethrow(e, "removeSession");
        }
    }

    static async deleteWallet(walletId, passwordHash) {
        log.debug("Start deleting the wallet");
        try {
            const mongoClient = await dbConnectionHolder.getClient();
            const session = mongoClient.startSession();
            session.startTransaction({
                readConcern: { level: "majority" },
                writeConcern: { w: "majority" },
                readPreference: "primary",
            });
            try {
                const walletsCollection = await dbConnectionHolder.getCollection(walletsDbCollectionName);

                const passwordHashSecured = WalletsService._securePasswordHash(passwordHash);
                if (
                    (await walletsCollection.findOne({ walletId })) &&
                    !(await walletsCollection.findOne({ walletId, passwordHashSecured }))
                ) {
                    return { result: false };
                }

                const deleteManyResult = await walletsCollection.deleteMany({ walletId });

                if (!isDeleteManyResultValid(deleteManyResult, false)) {
                    throw new Error("Failed to delete wallet - some db error.");
                }

                log.debug("Checking that wallet has been actually deleted.");
                if (await walletsCollection.findOne({ walletId })) {
                    throw new Error("Wallet has not been deleted.");
                }

                log.debug("Start deleting related data as the wallet has been removed successfully.");

                await EncryptedIpsService.deleteAllEncryptedIpsForWallet(walletId);
                await TransactionsDataService.removeAllTransactionsDataForWallet(walletId);
                await EncryptedInvoicesService.deleteAllEncryptedInvoices(walletId);
                await AddressesDataService.removeAllAddressesData(walletId);

                log.debug("Wallet and all related data have been successfully deleted. Committing transaction.");

                await session.commitTransaction();

                log.debug("Transaction has been successfully committed. Returning true result.");

                return { result: true };
            } catch (e) {
                await session.abortTransaction();
                throw e;
            } finally {
                session.endSession();
            }
        } catch (e) {
            improveAndRethrow(e, "deleteWallet");
        }
    }
}
