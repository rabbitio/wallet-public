import { getSaltedHash } from "../adapters/crypto-utils";
import { getDataPassword, saveCurrentIpHash } from "./internal/storage";
import { improveAndRethrow, logError } from "../utils/errorUtils";
import { ipToStringOfBytes } from "./ipsService";
import { CLIENT_IP_HASH_LIFETIME } from "../../properties";
import IpAddressProvisioningService from "../external-apis/ipAddressProviders";

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
            improveAndRethrow(e, "provideIpHashStored");
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
            const ipAddress = await IpAddressProvisioningService.getClientIpAddress();
            const ipHash = getSaltedHash(ipToStringOfBytes(ipAddress), dataPassword);

            return ipHash;
        } catch (e) {
            improveAndRethrow(e, "calculateIpHash");
        }
    }
}

async function provideIpHash() {
    let ip = await IpAddressProvisioningService.getClientIpAddress();
    ip = ipToStringOfBytes(ip);
    const ipHash = getSaltedHash(ip, getDataPassword() || "");

    saveCurrentIpHash(ipHash);

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
                logError(e, null, "Failed to execute provideIpHashStoredAndItsUpdate. ");
            }
        })();
    }, CLIENT_IP_HASH_LIFETIME);
}
