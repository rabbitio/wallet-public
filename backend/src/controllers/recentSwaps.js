import log4js from "log4js";

import { ControllerUtils } from "./controllerUtils.js";
import { RECENT_SWAPS_EP_NUMBER } from "./endpointNumbers.js";
import { getSwapsList } from "../services/swapListGenerator.js";

const log = log4js.getLogger("clientLogs");

export default class RecentSwaps {
    /**
     * Retrieves recent swaps
     *
     * It sends:
     *    HTTP Code:
     *      - 200 if swaps successfully retrieved
     *      - 500 for internal errors
     *    Body:
     *      - for non 200 status
     *        { swaps: Object[]}
     */
    static async retrieveRecentSwaps(req, res) {
        log.debug("Retrieve swaps.");

        const endpointNumber = RECENT_SWAPS_EP_NUMBER;
        try {
            const swaps = getSwapsList(10);

            log.debug("Swaps retrieved successfully. Sending 200.");
            ControllerUtils.processSuccess(res, 200, { swaps: swaps });
        } catch (e) {
            ControllerUtils.processInternalError(res, endpointNumber, "Failed to retrieve swaps", e);
        }
    }
}
