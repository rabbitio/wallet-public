import { BigNumber } from "bignumber.js";

export default class InputValuesProviders {
    /**
     * Designed to be called onKeyUp event of html input field for float value
     * Removes all prohibited stuff from the given float string and remains only allowed.
     * Removes digits before and after the dot.
     *
     * @param inputString {string} string to be corrected
     * @param maxValue {string} max value for the correcting float value
     * @param digitsAfterDot {number} count of digits after the dot that this method should provide, min 1
     * @return {string} corrected float value string
     */
    static provideFormatOfFloatValueByInputString(inputString, digitsAfterDot = 2, maxValue = null) {
        let value = inputString;
        if (!value) {
            return "";
        }

        if (digitsAfterDot < 1) {
            throw new Error("Min suffix length is 1, got " + digitsAfterDot);
        }

        value = value.replace(/[,]/g, "."); // replaces commas with dots
        value = value.replace(/[^0-9.]/g, ""); // remove non digits/dots
        value = value.replace(/^\./g, "0."); // adds leading zero
        value = value.replace(/\.+/g, "."); // replaces series of dots with single dot

        let parts = value.split(".");
        if (parts.length > 2) {
            // removes all after second dot and itself
            parts = [parts[0], parts[1]];
        }

        if (maxValue != null) {
            const maxDigitsCountBeforeTheDot = BigNumber(maxValue).toFixed(0).length;
            if (parts[0]?.length > maxDigitsCountBeforeTheDot) {
                // removes redundant prefix digits
                parts[0] = parts[0].substring(parts[0].length - maxDigitsCountBeforeTheDot, parts[0].length);
            }
        }

        if (parts[1]?.length > digitsAfterDot) {
            // removes redundant suffix digits
            parts[1] = parts[1].substring(0, digitsAfterDot);
        }

        return parts.join(".");
    }
}
