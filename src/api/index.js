import { Logger, LogsStorage } from "@rabbitio/ui-kit";

import { setupMediators } from "./common/services/mediators/mediators.js";
import ClientIpHashService from "./auth/services/internal/clientIpHashService.js";
import { isCurrentSessionValid } from "./auth/services/authService.js";
import {
    EventBus,
    THERE_IS_NO_SESSION_ON_APP_INITIALIZATION_EVENT,
    THERE_IS_SESSION_ON_APP_INITIALIZATION_EVENT,
} from "./common/adapters/eventbus.js";
import { blocksListener } from "./wallet/btc/services/internal/blocksListener.js";
import { currentBlockService } from "./wallet/btc/services/internal/currentBlockService.js";
import { IS_TESTING } from "../properties.js";
import { ScheduledLogger } from "./support/services/internal/logs/scheduledLogger.js";

// TODO: [refactoring, moderate] wrap initializers into neat functions for readability
export function setupAppAndInitializeBackgroundTasks(
    handleNotFoundSession,
    handleLogout,
    handleNewNotLocalTxs,
    handleDiscoveredAuthentication,
    dontCheckSession
) {
    const isSwapsMode = dontCheckSession; // TODO: [refactoring, moderate] remove this after separating swap product from wallet. task_id=c218508bccce42c4b45067e78fd2e202
    const initializers = [
        IS_TESTING ? [] : ClientIpHashService.provideIpHashStoredAndItsUpdate,
        () =>
            (async () => {
                if (!isSwapsMode) {
                    if (await isCurrentSessionValid(false)) {
                        EventBus.dispatch(THERE_IS_SESSION_ON_APP_INITIALIZATION_EVENT);
                    } else {
                        EventBus.dispatch(THERE_IS_NO_SESSION_ON_APP_INITIALIZATION_EVENT);
                    }
                }
            })(),
        () => setupMediators(handleNotFoundSession, handleLogout, handleNewNotLocalTxs, handleDiscoveredAuthentication),
        IS_TESTING || isSwapsMode ? [] : () => blocksListener.setupListeningForNewBlocks(),
        isSwapsMode ? [] : () => currentBlockService.initialize(),
        IS_TESTING || isSwapsMode ? [] : ScheduledLogger.logWalletSlicePeriodically,
        IS_TESTING ? [] : ScheduledLogger.logExternalServicesStatsPeriodically,
        IS_TESTING ? [] : () => setInterval(() => LogsStorage.saveToTheDisk(Logger), 10000),
    ].flat();

    initializers.forEach(initializer => {
        (async () => {
            try {
                await initializer();
            } catch (e) {
                Logger.logError(e, "initializer failed");
            }
        })();
    });
}
