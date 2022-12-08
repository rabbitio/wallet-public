import { improveAndRethrow } from "../../../common/utils/errorUtils";

export class NumbersUtils {
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
