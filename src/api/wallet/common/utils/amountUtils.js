import { improveAndRethrow } from "../../../common/utils/errorUtils";

import FiatCurrenciesService from "../../../fiat/services/internal/fiatCurrenciesService";
import { Logger } from "../../../support/services/internal/logs/logger";
import { NumbersUtils } from "./numbersUtils";

export class AmountUtils {
    static significantDecimalCount = 8;
    static collapsedDecimalCount = 2;
    static maxTotalLength = 12;

    static defaultFiatParams = {
        ticker: true, // If true, currency code will be shown
        enableCurrencySymbols: true, // Enables currency symbols where available. Requires "ticker: true"
        collapsible: true, // Enables minimization of amounts over 1 million (example: 1.52M)
    };

    /**
     * Universal method for rendering of fiat amounts, taking into account the rules of
     * the passed fiat currency code.
     *
     * @param amount {number} The number value to be trimmed
     * @param currencyCode {string} The asset object, according to which the amount should be formatted
     * @param [passedParams={}] {object} Formatting parameters
     * @return {string} Formatted fiat amount string
     */
    static fiat(amount, currencyCode, passedParams = {}) {
        try {
            const params = { ...this.defaultFiatParams, ...passedParams };

            const currencySymbol = FiatCurrenciesService.getCurrencySymbolByCode(currencyCode);
            const currencyDecimalCount = FiatCurrenciesService.getCurrencyDecimalCountByCode(currencyCode);

            if (this.checkIfNull(amount)) return "NULL";

            let processedAmount;

            // Shorten the decimal count to the currency's one
            processedAmount = this.trimDigitsAfterPeriod(amount, currencyDecimalCount);

            // Collapse the 1M+ amounts if applicable
            processedAmount = params.collapsible
                ? this.collapseAmount(processedAmount, this.collapsedDecimalCount)
                : this.toNonScientificString(processedAmount, currencyDecimalCount);

            // Add commas to the amount
            processedAmount = this.addCommasToAmountString(processedAmount);

            // Add the currency code or currency symbol, if symbol is enabled and available
            if (params.ticker)
                processedAmount =
                    currencySymbol && params.enableCurrencySymbols
                        ? currencySymbol + (currencySymbol.length > 1 ? " " : "") + processedAmount
                        : processedAmount + " " + currencyCode;

            return processedAmount;
        } catch (e) {
            improveAndRethrow(e, "fiat", `Passed: ${amount}`);
        }
    }

    static defaultCryptoParams = {
        ticker: true, // If true, asset ticker will be shown
        fullTicker: false, // Enables the full unique ticker with protocol. Requires "ticker: true"
        collapsible: true, // Enables minimization of amounts over 1 million (example: 1.52M)
        trim: true, // Cuts the right part of the amount if necessary, and adds ".." in the end
        limitTotalLength: true, // Limits the total amount length to maxTotalLength
    };

    /**
     * Universal method for rendering of crypto amounts, taking into account the rules of
     * the passed Coin. Requires the number of digits after period to be less of equal to
     * the number of digits, supported by the passed Coin.
     *
     * @param amount {number} The number value to be formatted
     * @param [coin] {Coin} The asset object, according to which the amount should be formatted
     * @param passedParams {object} Formatting parameters
     * @return {string} Formatted crypto amount string
     */
    static crypto(amount, coin, passedParams) {
        try {
            const params = { ...this.defaultCryptoParams, ...passedParams };

            if (this.checkIfNull(amount)) return "NULL";

            let processedAmount = amount;
            let addPeriods = false;

            // Check decimal count and throw an error, if the amount has more decimal digits than supported by the asset
            let decimalLength = !!(amount % 1) ? String(amount).split(".")[1].length : 0;
            if (decimalLength > coin.digits) {
                const errorMessage = `An attempt to render a crypto value with too many digits after period was made: ${amount}, allowed digits: ${coin.digits}. This is a no-op, since the logical and visually rendered values would differ, which is not acceptable for crypto amounts. Please trim the amount before rendering, using the trimCryptoAmountByCoin(amount, coin) method.`;
                // throw new Error(errorMessage);
                Logger.log(errorMessage, "crypto");
            }
            // Shortening the value to general significant number of digits after period (likely 8)
            if (params.trim) {
                const trimmedAmount = this.trimDigitsAfterPeriod(amount, this.significantDecimalCount);
                // TODO: [dev] Numbers comparison is unsafe, use string amounts. task_id=70c1984b622847cd9e3e771822b1fc31
                // addPeriods = processedAmount !== trimmedAmount;
                processedAmount = trimmedAmount;
            }

            // Limit the total length of the crypto amount
            let totalLength = this.toNonScientificString(amount, coin.digits).length;
            if (params.limitTotalLength && totalLength > this.maxTotalLength) {
                const delta = totalLength - this.maxTotalLength;
                const newDecimalCount = decimalLength - delta;
                const lengthLimitedAmount = this.trimDigitsAfterPeriod(
                    processedAmount,
                    newDecimalCount > 2 ? newDecimalCount : 2
                );

                // TODO: [dev] Numbers comparison is unsafe, use string amounts. task_id=70c1984b622847cd9e3e771822b1fc31
                // if (lengthLimitedAmount !== processedAmount) addPeriods = true;

                processedAmount = lengthLimitedAmount;
            }

            // Collapse the 1M+ amounts if applicable
            processedAmount = params.collapsible
                ? this.collapseAmount(processedAmount, this.collapsedDecimalCount)
                : this.toNonScientificString(processedAmount, coin.digits);

            // Add commas to the amount
            processedAmount = this.addCommasToAmountString(processedAmount);

            // Adding periods, if the amount was shortened
            if (addPeriods && !(params.collapsible && amount >= 1000000)) processedAmount = processedAmount + "..";

            // Adding an adaptive (printable/full) ticker
            if (params.ticker)
                processedAmount = processedAmount + " " + (params.fullTicker ? coin.ticker : coin.tickerPrintable);

            return processedAmount;
        } catch (e) {
            improveAndRethrow(e, "crypto", `Passed: ${amount}, ${coin}`);
        }
    }

    static checkIfNull(amount) {
        return amount == null || amount === "" || Number.isNaN(amount);
    }

    /**
     * Trims all digits after period, according to the provided decimalCount.
     *
     * TODO: [bug, critical] We need to verify is the Number() conversion safe in terms of producing not precise numbers. task_id=70c1984b622847cd9e3e771822b1fc31
     *
     * @param amount {number|string} The number value to be trimmed
     * @param decimalCount {number} The number of digits after period to keep
     * @param [convertToNumber=true] {boolean} Whether to convert result to number
     * @return {number|string} Number|string with trimmed right part
     */
    static trimDigitsAfterPeriod(amount, decimalCount, convertToNumber = true) {
        try {
            if ((typeof amount === "string" && amount.split(".").length === 1) || Number.isInteger(amount))
                return convertToNumber ? Number(amount) : String(amount);
            const separatedAmount = this.toNonScientificString(amount, decimalCount);
            return convertToNumber ? Number(separatedAmount) : separatedAmount;
        } catch (e) {
            improveAndRethrow(e, "trimDigitsAfterPeriod", `Passed: ${amount}, ${decimalCount}`);
        }
    }

    /**
     * Trims all digits after period that exceed the number of digits, supported by the provided asset.
     *
     * @param amount {number} The number value to be trimmed
     * @param [coin] {Coin} The coin object for the amount
     * @return {number} Number with trimmed right part
     */
    static trimCryptoAmountByCoin(amount, coin) {
        try {
            if (this.checkIfNull(amount)) return false;
            return this.trimDigitsAfterPeriod(amount, coin.digits);
        } catch (e) {
            improveAndRethrow(e, "trimCryptoAmountByCoin", `Passed: ${amount}, ${coin}`);
        }
    }

    /**
     * Shortens the line length by using a "1.52M" representation of big amounts.
     * Important note: This function receives number value, and returns a string one.
     *
     * @param amount {number} The number value to be trimmed
     * @param decimalCount {number} The number of digits after period to keep
     * @return {string} A shortened string, converted into "X millions" format, if the amount exceeds 1 million
     */
    static collapseAmount(amount, decimalCount) {
        try {
            // Only convert to a string for consistency, if the amount is less than a million
            if (amount < 1000000) return amount.toString();

            let processedAmount;

            processedAmount = amount / 1000000;
            processedAmount = processedAmount.toFixed(decimalCount);
            processedAmount = processedAmount + "M";

            return processedAmount;
        } catch (e) {
            improveAndRethrow(e, "collapseAmount", `Passed: ${amount}, ${decimalCount}`);
        }
    }

    /**
     * Adds commas to the amount string to improve readability.
     * Example: 6182425.58 -> 6,182,425.58.
     *
     * @param amountString {string} An amount in a string type, can also be in "millions" format
     * @return {string} A string with added commas
     */
    static addCommasToAmountString(amountString) {
        try {
            const rightPart = amountString.includes(".") ? amountString.split(".")[1] : null;

            const amountToFormat = rightPart ? amountString.split(".")[0] : amountString;
            const formattedAmount = Number(amountToFormat).toLocaleString("en-US");

            return rightPart ? formattedAmount + "." + rightPart : formattedAmount;
        } catch (e) {
            improveAndRethrow(e, "addCommasToAmountString", `Passed: ${amountString}`);
        }
    }

    static toNonScientificString(amount, decimalsCount) {
        const isFloat = !Number.isInteger(amount);
        if (isFloat) {
            // TODO: [bug, critical] this is really bad solution as JS numbers has restricted preciseness and
            //       toLocaleString reduces it even more depending on the left part of number. task_id=70c1984b622847cd9e3e771822b1fc31
            const correctlyTrimmedString = Number(amount).toLocaleString(undefined, {
                maximumFractionDigits: Math.min(decimalsCount, 20), // 20 is max supported decimals count
                roundingMode: "floor",
                useGrouping: false,
            });
            return NumbersUtils.removeRedundantRightZerosFromNumberString(correctlyTrimmedString);
        }

        return String(amount);
    }
}
