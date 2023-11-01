import { improveAndRethrow } from "../../../common/utils/errorUtils";

// TODO: [refactoring, moderate] we decided to use AmountUtils as the source of all numbers-printing-related operations.
//       So this class should be refactored/removed task_id=70c1984b622847cd9e3e771822b1fc31
//       Also currently this implementation suffers from the same problems as the AmountUtils, see the mentioned task for details.
export class NumbersUtils {
    /**
     * Is enough for most coins to represent valuable amount. Recognized practically.
     * @type {number}
     */
    static maxDigitsAfterDot = 8;

    static _defaultMaxNumberLength = 13;

    /**
     * @deprecated use AmountUtils instead
     *
     * Reduces the long amount:
     * 1. trims right part of floating point number if its length is greater than the maxDigitsAfterDot and lefts the smallest digits count of maxDigitsAfterDot and coinSignificantDigits
     * 2. removes redundant zeros from trimmed number string
     * 3.1 either converts left part to its millions only if the formatted number length is greater than the maxDigitsInWholeNumber
     * 3.2 or removes right digits after the dot to fit maxDigitsInWholeNumber
     *
     * @param coinAmount {(string|number)}
     * @param coinSignificantDigits {number}
     * @param [maxDigitsInWholeNumber=10] {(number|null)} max length of the trimmed number. Should be greater than the maxDigitsAfterDot or null
     * @return {string} formatted number string
     */
    static trimCurrencyAmount(coinAmount, coinSignificantDigits, maxDigitsInWholeNumber = null) {
        try {
            if (coinAmount == null || coinAmount === "" || Number.isNaN(coinAmount)) {
                return "";
            }
            if (maxDigitsInWholeNumber == null) {
                maxDigitsInWholeNumber = this._defaultMaxNumberLength;
            } else if (maxDigitsInWholeNumber <= this.maxDigitsAfterDot) {
                throw new Error("maxDigitsInWholeNumber should be greater than maxDigitsAfterDot");
            }

            let amountFormatted;
            if (typeof coinAmount === "number") {
                amountFormatted = coinAmount.toFixed(Math.min(coinSignificantDigits, this.maxDigitsAfterDot));
            } else {
                const dotIndex = coinAmount.indexOf(".");
                amountFormatted =
                    dotIndex < 0
                        ? coinAmount
                        : coinAmount.slice(0, dotIndex + Math.min(coinSignificantDigits, this.maxDigitsAfterDot) + 1);
            }
            amountFormatted = this.removeRedundantRightZerosFromNumberString(amountFormatted);
            if (amountFormatted.length > maxDigitsInWholeNumber) {
                const dotIndex = amountFormatted.indexOf(".");
                if (dotIndex > 9 || dotIndex === -1) {
                    // Converting left part to millions
                    const leftPart = dotIndex === -1 ? amountFormatted : amountFormatted.slice(0, dotIndex);
                    const millions = leftPart.slice(0, leftPart.length - 6);
                    const rightPartMaxLength = maxDigitsInWholeNumber - millions.length - ".".length - " M".length;
                    const rightPart = leftPart.slice(leftPart.length - 6, leftPart.length - 6 + rightPartMaxLength);
                    const withoutZeros = this.removeRedundantRightZerosFromNumberString(`${millions}.${rightPart}`);
                    amountFormatted = `${withoutZeros} M`;
                } else {
                    // No millions but we can cut right part after the dot
                    amountFormatted = this.removeRedundantRightZerosFromNumberString(
                        amountFormatted.slice(0, maxDigitsInWholeNumber)
                    );
                }
            }
            return amountFormatted;
        } catch (e) {
            improveAndRethrow(e, "trimCurrencyAmount");
        }
    }

    /**
     * @param numberAsAString {string}
     * @return {string}
     */
    static removeRedundantRightZerosFromNumberString(numberAsAString) {
        try {
            const parts = ("" + numberAsAString).split(".");
            let right = parts[1];
            while (right?.length && right[right.length - 1] === "0") {
                right = right.slice(0, right.length - 1);
            }

            return `${parts[0]}${right?.length ? `.${right}` : ""}`;
        } catch (e) {
            improveAndRethrow(e, "removeRedundantRightZerosFromNumberString", `Passed: ${numberAsAString}`);
        }
    }
}
