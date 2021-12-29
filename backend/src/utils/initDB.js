import { getLogger } from "log4js";

import FiatRatesService from "../services/fiatRatesService";

const log = getLogger("dbInitialization");

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
