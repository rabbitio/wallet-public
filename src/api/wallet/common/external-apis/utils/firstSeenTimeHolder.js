import { improveAndRethrow } from "@rabbitio/ui-kit";

/**
 * This array and function are needed as some providers give no first seen time for transaction. So we store it
 * in memory here. It is not robust but affordable as most likely user will stay at the same page till the
 * transaction confirmation.
 */
const firstSeenTimeValues = [];

/**
 * Saves current timestamp for given hash
 *
 * @param txidHashed {string} hash
 * @return {number} seconds timestamp the hash is saved at
 */
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
