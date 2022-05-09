import ipaddr from "ipaddr.js";

import { improveAndRethrow } from "../utils/errorUtils";
import { decrypt, encrypt, getSaltedHash } from "../adapters/crypto-utils";
import { getDataPassword, getWalletId } from "./internal/storage";
import {
    deleteEncryptedIpAddresses,
    getAllEncryptedIpAddresses,
    isIpHashPresent,
    saveEncryptedIpAddress,
} from "../external-apis/backend-api/encryptedIpsApi";
import { Logger } from "./internal/logs/logger";

/**
 * Encrypts and saves given IP.
 *
 * @param ip - IP address
 * @returns Promise resolving to nothing
 */
export async function saveIpAddress(ip) {
    const loggerSource = "saveIpAddress";
    try {
        Logger.log(`Start saving IP address. It is empty: ${!!ip}`, loggerSource);

        const bytesRepresentation = ipToStringOfBytes(ip);
        const dataPassword = getDataPassword();
        const encryptedIp = encrypt(ip, dataPassword);
        const ipHash = getSaltedHash(bytesRepresentation, dataPassword);
        await saveEncryptedIpAddress(getWalletId(), encryptedIp, ipHash);

        Logger.log(`IP address was saved`, loggerSource);
    } catch (e) {
        improveAndRethrow(e, loggerSource);
    }
}

/**
 * Provides the same string for the same addresses written differently to get the same hashes for same IPs
 */
export function ipToStringOfBytes(ip) {
    try {
        const bytesArray = ipaddr.parse(ip).toByteArray();
        return bytesArray.join(",");
    } catch (e) {
        improveAndRethrow(
            e,
            "ipToStringOfBytes",
            `Parsing failed. IP length: ${ip?.length}, validation result: ${JSON.stringify(validateIpAddress(ip))}`
        );
    }
}

/**
 * Encrypts and deletes given IP address.
 *
 * @param ip - IP address
 * @returns Promise resolving to nothing
 */
export async function deleteIpAddress(ip) {
    const loggerSource = "deleteIpAddress";
    try {
        Logger.log(`Start deleting IP address. It is empty: ${!!ip}`, loggerSource);

        const bytesRepresentation = ipToStringOfBytes(ip);
        const ipHash = getSaltedHash(bytesRepresentation, getDataPassword());
        await deleteEncryptedIpAddresses(getWalletId(), [ipHash]);

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
export async function doesIpAddressExist(ip) {
    try {
        const bytesRepresentation = ipToStringOfBytes(ip);
        return await isIpHashPresent(getWalletId(), getSaltedHash(bytesRepresentation, getDataPassword()));
    } catch (e) {
        improveAndRethrow(e, "doesIpAddressExist");
    }
}

/**
 * Returns all ip addresses for current wallet (sorted by creation date desc).
 *
 * @returns {Promise<Array<string>>} Promise resolving to array of IPs
 */
export async function getAllIpAddresses() {
    const loggerSource = "getAllIpAddresses";
    try {
        Logger.log("Start getting all IP addresses", loggerSource);
        const allEncryptedIps = await getAllEncryptedIpAddresses(getWalletId());
        const result = allEncryptedIps.map(encryptedIp => decrypt(encryptedIp, getDataPassword()));

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
export function validateIpAddress(ip) {
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
