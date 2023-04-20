import { improveAndRethrow } from "../../common/utils/errorUtils";
import { ApiCallWrongResponseError, doApiCall, urlWithPrefix } from "../../common/backend-api/utils";
import { UserDataAndSettings, UserSettingValue } from "../../wallet/common/models/userDataAndSettings";

// TODO: [tests, moderate] Implement unit tests for these functions
// TODO: [refactoring, moderate] organize as a class

/**
 * Removes wallet and all its data from the server
 *
 * @param walletId - id of the wallet to be removed
 * @param passwordHash - password hash to check before deletion
 * @return Promise resolving to Object { result: true } if wallet is deleted and to { result: false } if password is wrong
 */
export async function deleteWallet(walletId, passwordHash) {
    try {
        const url = `${urlWithPrefix}/wallets/${walletId}?passwordHash=${passwordHash}`;

        const result = await doApiCall(url, "delete", null, [200, 204], "Failed to remove wallet. ");

        if (result !== "ok") {
            return { result: result.result };
        }

        return { result: true };
    } catch (e) {
        improveAndRethrow(e, "deleteWallet");
    }
}

/**
 * Saves wallet on server and returns new sessionId.
 *
 * @param walletId - wallet identifier
 * @param passphraseHash - hash of passphrase
 * @param passwordHash - hash of password
 * @param initialIndexesData - initial data for addresses indexes doc related to this wallet
 * @param initialAddressesData - initial addresses data for addresses data array of this wallet
 * @return Promise resolving to object { walletId: <hex_string>, sessionId: <uuid-string>}
 */
export async function saveWalletOnServerAndCreateSession(
    walletId,
    passphraseHash,
    passwordHash,
    initialIndexesData,
    initialAddressesData
) {
    try {
        const requestData = { walletId, passphraseHash, passwordHash, initialIndexesData, initialAddressesData };
        const errorMessage = "Failed to save wallet and create session. ";
        const endpoint = `${urlWithPrefix}/wallets`;

        return await doApiCall(endpoint, "post", requestData, 201, errorMessage, {
            doPostEventOnNotAuthenticated: false,
        });
    } catch (e) {
        improveAndRethrow(e, "saveWalletOnServerAndCreateSession");
    }
}

/**
 * Authenticates wallet by walletId and passwordHash and returns object with session or error description.
 *
 * @param walletId {string} wallet identifier
 * @param passphraseHash {string} hash needed to check passphrase correctness
 * @param passwordHash {string} hash of password to check correctness
 * @param ipHash {string} hash of IP address to verify whitelist matching
 * @return Promise resolving to authentication result Object
 */
export async function authenticateAndCreateSession(walletId, passphraseHash, passwordHash, ipHash) {
    try {
        const requestData = { walletId, passphraseHash, passwordHash };
        const errorMessage = "Failed to perform authentication. ";
        const endpoint = `${urlWithPrefix}/wallets/${walletId}`;

        const result = await doApiCall(endpoint, "post", requestData, 201, errorMessage, {
            doPostEventOnNotAuthenticated: false,
            ipHash,
        });
        const settingValues = UserDataAndSettings.getAllSettings().map(
            setting => new UserSettingValue(setting, (result?.settings ?? {})[setting.name])
        );
        return !result
            ? null
            : {
                  ...result,
                  walletData: new UserDataAndSettings(
                      +result?.creationTime,
                      +result?.lastPasswordChangeDate,
                      settingValues
                  ),
              };
    } catch (e) {
        improveAndRethrow(e, "authenticateAndCreateSession");
    }
}

/**
 * Performs logout on server for current wallet
 *
 * @return Promise resolving to request result
 */
export async function logoutWallet(walletId) {
    try {
        const errorMessage = "Failed to logout. ";
        const endpoint = `${urlWithPrefix}/wallets/${walletId}`;
        return await doApiCall(endpoint, "patch", null, 200, errorMessage, {
            doPostEventOnNotAuthenticated: false,
        });
    } catch (e) {
        if (!(e instanceof ApiCallWrongResponseError && e.isForbiddenError())) {
            improveAndRethrow(e, "logoutWallet");
        }
    }
}

/**
 * Checks password
 *
 * @param walletId - id of wallet to check the password for
 * @param passwordHash - password hash to be checked
 * @return Promise resolving to true if the password is correct and false otherwise
 */
export async function isPasswordHashCorrespondToWallet(walletId, passwordHash) {
    try {
        const url = `${urlWithPrefix}/wallets/${walletId}/password?passwordHash=${passwordHash}`;

        const result = await doApiCall(url, "get", null, 200);

        return result.result;
    } catch (e) {
        improveAndRethrow(e, "isPasswordHashCorrespondToWallet");
    }
}

/**
 * Checks passphrase
 *
 * @param walletId - id of wallet to check the password for
 * @param passphraseHash - passphrase hash to be checked
 * @return Promise resolving to ether { result: true }, { result: false, reason: "walletId" }, { result: false, reason: "passphrase" }
 */
export async function isPassphraseHashCorrespondToWallet(walletId, passphraseHash) {
    try {
        const url = `${urlWithPrefix}/wallets/${walletId}/passphrase?passphraseHash=${passphraseHash}`;

        const result = await doApiCall(url, "get", null, 200, { doPostEventOnNotAuthenticated: false });

        return result;
    } catch (e) {
        improveAndRethrow(e, "isPassphraseHashCorrespondToWallet");
    }
}

/**
 * Changes password hash
 *
 * @param walletId - id of wallet to check the password for
 * @param passwordHash - current password hash for check
 * @param newPasswordHash - new hash to be saved on server
 * @return Promise resolving to result object
 */
export async function changePasswordHash(walletId, passwordHash, newPasswordHash) {
    try {
        const url = `${urlWithPrefix}/wallets/${walletId}`;

        return await doApiCall(url, "put", { passwordHash, newPasswordHash }, 200);
    } catch (e) {
        improveAndRethrow(e, "changePasswordHash");
    }
}
