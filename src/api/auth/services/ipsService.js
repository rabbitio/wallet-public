import { improveAndRethrow, Logger, IpAddressProvider } from "@rabbitio/ui-kit";

import { decrypt, encrypt, getSaltedHash } from "../../common/adapters/crypto-utils.js";
import { Storage } from "../../common/services/internal/storage.js";
import {
    deleteEncryptedIpAddresses,
    getAllEncryptedIpAddresses,
    isIpHashPresent,
    saveEncryptedIpAddress,
} from "../backend-api/encryptedIpsApi.js";
import { IpsServiceInternal } from "./internal/ipsServiceInternal.js";

export class IPsService {
    /**
     * Encrypts and saves given IP.
     *
     * @param ip - IP address
     * @returns Promise resolving to nothing
     */
    static async saveIpAddress(ip) {
        const loggerSource = "saveIpAddress";
        try {
            Logger.log(`Start saving IP address. It is empty: ${!!ip}`, loggerSource);

            const bytesRepresentation = IpsServiceInternal.ipToStringOfBytes(ip);
            const dataPassword = Storage.getDataPassword();
            const encryptedIp = encrypt(ip, dataPassword);
            const ipHash = getSaltedHash(bytesRepresentation, dataPassword);
            await saveEncryptedIpAddress(Storage.getWalletId(), encryptedIp, ipHash);

            Logger.log(`IP address was saved`, loggerSource);
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Encrypts and deletes given IP address.
     *
     * @param ip - IP address
     * @returns Promise resolving to nothing
     */
    static async deleteIpAddress(ip) {
        const loggerSource = "deleteIpAddress";
        try {
            Logger.log(`Start deleting IP address. It is empty: ${!!ip}`, loggerSource);

            const bytesRepresentation = IpsServiceInternal.ipToStringOfBytes(ip);
            const ipHash = getSaltedHash(bytesRepresentation, Storage.getDataPassword());
            await deleteEncryptedIpAddresses(Storage.getWalletId(), [ipHash]);

            Logger.log("IP address was removed", loggerSource);
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Checks whether given IP address exists.
     *
     * @param ip - IP address
     * @returns Promise resolving to true if address exists and to false if it does not
     */
    static async doesIpAddressExist(ip) {
        try {
            const bytesRepresentation = IpsServiceInternal.ipToStringOfBytes(ip);
            return await isIpHashPresent(
                Storage.getWalletId(),
                getSaltedHash(bytesRepresentation, Storage.getDataPassword())
            );
        } catch (e) {
            improveAndRethrow(e, "doesIpAddressExist");
        }
    }

    /**
     * Returns all ip addresses for current wallet (sorted by creation date desc).
     *
     * @returns {Promise<Array<string>>} Promise resolving to array of IPs
     */
    static async getAllIpAddresses() {
        const loggerSource = "getAllIpAddresses";
        try {
            Logger.log("Start getting all IP addresses", loggerSource);
            const allEncryptedIps = await getAllEncryptedIpAddresses(Storage.getWalletId());
            const result = allEncryptedIps.map(encryptedIp => decrypt(encryptedIp, Storage.getDataPassword()));

            Logger.log(`Returning ${result.length} IP addresses`, loggerSource);
            return result;
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Checks whether given string is valid IP or not.
     * IPv4:
     *   - has exactly 4 groups separated by "."
     *   - groups have no leading zeros (except "0" group)
     *   - groups are plain decimal numbers between 0 and 255 (inclusive) (exponential form is prohibited) or empty groups
     *  IPv6:
     *   - has exactly 8 groups separated by ":"
     *   - each group is hex number having <= 4 digits or empty group
     *
     * @param ip - IP address (v4 or v6) string
     * @returns boolean - true if only given string is valid IP address
     */
    static validateIpAddress(ip) {
        if (!ip || !(typeof ip === "string") || ip === "") {
            return false;
        }

        let result = false;
        let groups = ip.split(".");
        if (groups.length === 4) {
            // possibly IPv4 case
            result =
                groups.filter(group => !group.match(/^-?0\d+/g) && !group.match(/[eE]/g)).length === 4 &&
                groups.map(part => +part).filter(group => group >= 0 && group < 256).length === 4;
        } else {
            // possibly IPv6 case
            groups = ip.split(":");
            result =
                groups.length === 8 &&
                groups.filter(group => group.length <= 4 && (!isNaN(+`0x${group}`) || group === "")).length === 8;
        }

        return result;
    }

    /**
     * Returns IP address.
     * Just wraps the internal provider API
     *
     * @return {Promise<string>} resolves to IP address string
     */
    static async getClientIpAddress() {
        return await IpAddressProvider.getClientIpAddress();
    }
}
