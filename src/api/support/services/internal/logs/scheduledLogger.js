import { Logger, RobustExternalAPICallerService } from "@rabbitio/ui-kit";

import { WalletSliceService } from "../../../../wallet/common/services/utils/walletSliceService.js";

export class ScheduledLogger {
    static logExternalServicesStatsPeriodically() {
        (async () => {
            try {
                await logExternalServicesStats();
                setInterval(logExternalServicesStats, 600 * 1000);
                Logger.log("Setup performed", "logExternalServicesStatsPeriodically");
            } catch (e) {
                Logger.logError(e, "logExternalServicesStatsPeriodically");
            }
        })();
    }

    static logWalletSlicePeriodically() {
        (async () => {
            try {
                setInterval(logWalletDataSlice, 600 * 1000);
                Logger.log("Setup performed", "logWalletSlicePeriodically");
            } catch (e) {
                Logger.logError(e, "logWalletSlicePeriodically");
            }
        })();
    }
}

export async function logExternalServicesStats() {
    try {
        Logger.log(
            `EXTERNAL SERVICES STATS:\n${JSON.stringify(RobustExternalAPICallerService.getStats())}`,
            "logExternalServicesStats"
        );
    } catch (e) {
        Logger.logError(e, "logExternalServicesStats");
    }
}

export async function logWalletDataSlice() {
    try {
        const dataSliceString = await WalletSliceService.getCurrentWalletDataSliceString();
        Logger.log(`WALLET DATA SLICE:\n${dataSliceString}`, "logWalletDataSlice");
    } catch (e) {
        Logger.logError(e, "logWalletDataSlice");
    }
}
