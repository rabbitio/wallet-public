import { improveAndRethrow } from "../../utils/errorUtils";

/**
 * This array and function are needed as some providers five no first seen time for transaction. So we store it
 * in memory here. It is not robust but affordable as most likely user will stay at the same page till the
 * transaction confirmation.
 */
const firstSeenTimeValues = [];
export function provideFirstSeenTime(txidHashed) {
    try {
        const item = firstSeenTimeValues.find(item => item.txidHashed === txidHashed);
        if (item) {
            return item.time;
        }

        const newItem = { txidHashed, time: Math.round(Date.now() / 1000) };
        firstSeenTimeValues.push(newItem);

        return newItem.time;
    } catch (e) {
        improveAndRethrow(e, "provideFirstSeenTime");
    }
}
