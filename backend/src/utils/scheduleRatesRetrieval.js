import schedule from "node-schedule";
import log4js from "log4js";

import FiatRatesService from "../services/fiatRatesService.js";

const log = log4js.getLogger("fiatRatesService");

/**
 * Schedules rates retrieval to keep the rates document in DB up to date
 */
export function scheduleRatesRetrieval() {
    try {
        log.info("Start scheduling fiat rates updates.");
        schedule.scheduleJob({ hours: 1 }, async () => await FiatRatesService.saveMissing());
        log.info("Scheduling fiat rates updates was finished.");
    } catch (e) {
        log.error("Failed to schedule fiat rates updating", e);
    }
}
