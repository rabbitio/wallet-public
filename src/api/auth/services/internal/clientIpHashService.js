import { improveAndRethrow, Logger, IpAddressProvider } from "@rabbitio/ui-kit";

import { getSaltedHash } from "../../../common/adapters/crypto-utils.js";
import { Storage } from "../../../common/services/internal/storage.js";
import { CLIENT_IP_HASH_LIFETIME } from "../../../../properties.js";
import { IpsServiceInternal } from "./ipsServiceInternal.js";

export default class ClientIpHashService {
    /**
     * ID of timeout updating client IP hash
     */
    static timeoutId;

    /**
     * Retrieves current client's IP address and returns hash of it. Schedules update of stored address.
     * Hash is wallet-dependent for security reasons
     *
     * @returns Hash of current client IP address
     */
    static async provideIpHashStoredAndItsUpdate() {
        try {
            scheduleUpdateOfClientIPAddressHash();

            return await provideIpHash();
        } catch (e) {
            improveAndRethrow(e, "provideIpHashStoredAndItsUpdate");
        }
    }

    /**
     * Retrieves and saves current client IP address hash.
     * @return Promise resolving to ip address hash
     */
    static async provideIpHashStored() {
        try {
            return await provideIpHash();
        } catch (e) {
            // TODO: [bug, moderate] setup retrying for IP address retrieval task_id=9e8398855f6b43ad83875fe475c6110e
            Logger.logError(e, "provideIpHashStored");
        }
    }

    /**
     * Calculates hash of current client IP address
     *
     * @param dataPassword - data password of wallet to calculate hash for
     * @return {Promise<string>} - IP hash
     */
    static async calculateIpHash(dataPassword) {
        try {
            const ipAddress = await IpAddressProvider.getClientIpAddress();
            const ipHash = getSaltedHash(IpsServiceInternal.ipToStringOfBytes(ipAddress), dataPassword);

            return ipHash;
        } catch (e) {
            improveAndRethrow(e, "calculateIpHash");
        }
    }
}

async function provideIpHash() {
    let ip = await IpAddressProvider.getClientIpAddress();
    ip = IpsServiceInternal.ipToStringOfBytes(ip);
    const ipHash = getSaltedHash(ip, Storage.getDataPassword() || "");

    Storage.saveCurrentIpHash(ipHash);

    return ipHash;
}

function scheduleUpdateOfClientIPAddressHash() {
    if (ClientIpHashService.timeoutId != null) {
        clearTimeout(ClientIpHashService.timeoutId);
    }

    ClientIpHashService.timeoutId = setTimeout(() => {
        (async () => {
            try {
                await ClientIpHashService.provideIpHashStoredAndItsUpdate();
            } catch (e) {
                Logger.logError(e, null, "Failed to execute provideIpHashStoredAndItsUpdate. ");
            }
        })();
    }, CLIENT_IP_HASH_LIFETIME);
}
