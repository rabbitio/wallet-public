import { logError } from "../../../common/utils/errorUtils";
import { tronUtils } from "../adapters/tronUtils";

/**
 * Validates tron address.
 *
 * @param addressBase58Check {string} address string in base58check format
 * @returns {boolean} true if given string is a valid tron address and false otherwise
 */
export function validateTronAddress(addressBase58Check) {
    try {
        return tronUtils.isAddressValid(addressBase58Check);
    } catch (e) {
        logError(e, "validateTronAddress", "Failed to validate tron address, treating as the address is wrong");
        return false;
    }
}
