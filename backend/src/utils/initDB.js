import log4js from "log4js";

import FiatRatesService from "../services/fiatRatesService.js";

const log = log4js.getLogger("dbInitialization");

export default function performDBInitialization() {
    (async () => {
        try {
            await FiatRatesService.saveRatesHistoryDataToDb();
            log.info("DB has been initialized.");
        } catch (e) {
            log.error("DB initialization failed.", e);
        }
    })();
}
