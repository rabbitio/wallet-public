export default class InputValuesProviders {
    /**
     * Designed to be called onKeyUp event of html input field for Bitcoin amount.
     * Removes all prohibited stuff from the given amount string and remains only allowed.
     *
     * @param inputString - string to be corrected to became the proper Bitcoin amount
     * @return String - corrected Bitcoin amount, maybe empty
     */
    static provideFormatOfBitcoinAmountByInputString(inputString) {
        let value = inputString;
        if (!value) {
            return "";
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

        if (parts[0]?.length > 8) {
            // removes redundant prefix digits
            parts[0] = parts[0].substr(parts[0].length - 8, parts[0].length);
        }

        if (parts[1]?.length > 8) {
            // removes redundant suffix digits
            parts[1] = parts[1].substr(0, 8);
        }

        return parts.join(".");
    }
}
