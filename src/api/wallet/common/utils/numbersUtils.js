import { improveAndRethrow } from "../../../common/utils/errorUtils";

export class NumbersUtils {
    static maxDigitsAfterDot = 8;

    static trimCoinAmounts(amounts) {
        try {
            return amounts.map(amountBatch => {
                const [amount, coin] = amountBatch;

                let amountTrimmed;

                if (typeof amount === "number") {
                    amountTrimmed =
                        coin.digits > this.maxDigitsAfterDot
                            ? amount.toFixed(this.maxDigitsAfterDot)
                            : amount.toFixed(coin.digits);
                    amountTrimmed = this.removeRedundantRightZerosFromNumberString(amountTrimmed);
                } else {
                    const dotIndex = amount.indexOf(".");
                    amountTrimmed =
                        dotIndex < 0
                            ? amount
                            : coin.digits > this.maxDigitsAfterDot
                            ? amount.slice(0, dotIndex + this.maxDigitsAfterDot + 1)
                            : amount.slice(0, dotIndex + coin.digits + 1);
                    amountTrimmed = this.removeRedundantRightZerosFromNumberString(amountTrimmed);
                }

                return amountTrimmed;
            });
        } catch (e) {
            improveAndRethrow(e, "trimCoinAmounts");
        }
    }

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
