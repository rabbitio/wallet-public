import { logError } from "../../../../common/utils/errorUtils";
import { Logger } from "./logger";
import { externalServicesStatsCollector } from "../../../../common/services/utils/robustExteranlApiCallerService/externalServicesStatsCollector";
import { WalletSliceService } from "../../../../wallet/common/services/utils/walletSliceService";

export class ScheduledLogger {
    static logExternalServicesStatsPeriodically() {
        (async () => {
            try {
                await logExternalServicesStats();
                setInterval(logExternalServicesStats, 600 * 1000);
                Logger.log("Setup performed", "logExternalServicesStatsPeriodically");
            } catch (e) {
                logError(e, "logExternalServicesStatsPeriodically");
            }
        })();
    }

    static logWalletSlicePeriodically() {
        (async () => {
            try {
                setInterval(logWalletDataSlice, 600 * 1000);
                Logger.log("Setup performed", "logWalletSlicePeriodically");
            } catch (e) {
                logError(e, "logWalletSlicePeriodically");
            }
        })();
    }
}

export async function logExternalServicesStats() {
    try {
        Logger.log(
            `EXTERNAL SERVICES STATS:\n${JSON.stringify(externalServicesStatsCollector.getStats())}`,
            "logExternalServicesStats"
        );
    } catch (e) {
        logError(e, "logExternalServicesStats");
    }
}

export async function logWalletDataSlice() {
    try {
        const dataSliceString = await WalletSliceService.getCurrentWalletDataSliceString();
        Logger.log(`WALLET DATA SLICE:\n${dataSliceString}`, "logWalletDataSlice");
    } catch (e) {
        logError(e, "logWalletDataSlice");
    }
}
