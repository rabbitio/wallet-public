import { CHANGE_ADDRESS_UPDATE_INTERVAL_SECONDS } from "../../../../properties";
import CurrentAddressUtils from "./utils/currentAddressUtils";
import { getAccountsData, getCurrentNetwork, getWalletId } from "../../../common/services/internal/storage";
import { CHANGE_SCHEME, INTERNAL_CHANGE_INDEX } from "../lib/addresses";
import { improveAndRethrow, logError } from "../../../common/utils/errorUtils";
import { Logger } from "../../../support/services/internal/logs/logger";

/**
 * Provides API to schedule automatic change address updating (via interval) and removing these schedules.
 * Class has static state storing the scheduled tasks. Should not be instantiated.
 */
export default class ChangeAddressUpdateSchedulingService {
    static intervals = [];

    /**
     * Schedules updating of change address. The change addresses are being created for transactions creation, RBF etc.
     * We are getting current (unused) change address. But if the current address is used then we should perform the
     * addresses scanning to make sure that we are not missing some used addresses. But the scanning is pretty "heavy"
     * and can take several additional seconds and it will cause the user to wait.
     *
     * This service performs change address retrieval in background. So with high probability if the user starts some
     * operation requiring a change address then there will be no scanning.
     *
     * @param networks - networks to scan addresses for
     * @param intervalSeconds - optional custom interval in seconds to check addresses
     * @param maxCallsCount - optional max number of interval calls (for tests)
     * @returns undefined
     */
    static scheduleChangeAddressUpdates(
        networks = [getCurrentNetwork()],
        intervalSeconds = CHANGE_ADDRESS_UPDATE_INTERVAL_SECONDS,
        maxCallsCount = -1
    ) {
        const loggerSource = "scheduleChangeAddressUpdates";
        try {
            const intervalsCount = ChangeAddressUpdateSchedulingService.intervals.length;
            if (intervalsCount) {
                Logger.log(`Intervals (${intervalsCount}) already set. Skipping.`, loggerSource);
                return;
            }
            let callsCount = 0;
            ChangeAddressUpdateSchedulingService.intervals = networks.reduce((intervals, network) => {
                Logger.log(`Setting up for ${network.key}`, loggerSource);
                const intervalId = setInterval(() => {
                    if (maxCallsCount !== -1 && callsCount++ >= maxCallsCount) {
                        Logger.log("Removing updating by interval", `${loggerSource}_${network.key}`);
                        ChangeAddressUpdateSchedulingService.removeScheduledChangeAddressUpdating();
                    } else {
                        (async () => {
                            try {
                                Logger.log("Start scanning CHANGE-INTERNAL", `${loggerSource}_${network.key}`);
                                await CurrentAddressUtils._getCurrentAddress(
                                    getAccountsData(),
                                    network,
                                    getWalletId(),
                                    CHANGE_SCHEME,
                                    network.defaultAccountIndex,
                                    INTERNAL_CHANGE_INDEX,
                                    false
                                );
                                Logger.log("Finished scanning CHANGE-INTERNAL", `${loggerSource}_${network.key}`);
                            } catch (e) {
                                logError(e, `${loggerSource}_${network.key}`, "Failed to update change Address.");
                            }
                        })();
                    }
                }, intervalSeconds * 1000);

                return [...intervals, intervalId];
            }, []);

            Logger.log(`Set up ${ChangeAddressUpdateSchedulingService.intervals.length} intervals.`, loggerSource);
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Removes all scheduled change address updating intervals
     */
    static removeScheduledChangeAddressUpdating() {
        try {
            const intervalsCount = ChangeAddressUpdateSchedulingService.intervals.length;
            for (let i = 0; i < intervalsCount; ++i) {
                clearInterval(ChangeAddressUpdateSchedulingService.intervals.pop());
            }
        } catch (e) {
            improveAndRethrow(e, "removeScheduledChangeAddressUpdating");
        }
    }
}
