import { setupMediators } from "./common/services/mediators/mediators";
import ClientIpHashService from "./auth/services/internal/clientIpHashService";
import { isCurrentSessionValid } from "./auth/services/authService";
import {
    EventBus,
    THERE_IS_NO_SESSION_ON_APP_INITIALIZATION_EVENT,
    THERE_IS_SESSION_ON_APP_INITIALIZATION_EVENT,
} from "./common/adapters/eventbus";
import { logError } from "./common/utils/errorUtils";
import { blocksListener } from "./wallet/btc/services/internal/blocksListener";
import { currentBlockService } from "./wallet/btc/services/internal/currentBlockService";
import { IS_TESTING } from "../properties";
import { ScheduledLogger } from "./support/services/internal/logs/scheduledLogger";
import { LogsStorage } from "./support/services/internal/logs/logsStorage";

// TODO: [refactoring, moderate] wrap initializers into neat functions for readability
export function setupAppAndInitializeBackgroundTasks(
    handleNotFoundSession,
    handleLogout,
    handleNewNotLocalTxs,
    handleDiscoveredAuthentication
) {
    const initializers = [
        IS_TESTING ? [] : ClientIpHashService.provideIpHashStoredAndItsUpdate,
        () =>
            (async () => {
                if (await isCurrentSessionValid(false)) {
                    EventBus.dispatch(THERE_IS_SESSION_ON_APP_INITIALIZATION_EVENT);
                } else {
                    EventBus.dispatch(THERE_IS_NO_SESSION_ON_APP_INITIALIZATION_EVENT);
                }
            })(),
        () => setupMediators(handleNotFoundSession, handleLogout, handleNewNotLocalTxs, handleDiscoveredAuthentication),
        IS_TESTING ? [] : () => blocksListener.setupListeningForNewBlocks(),
        () => currentBlockService.initialize(),
        IS_TESTING ? [] : ScheduledLogger.logWalletSlicePeriodically,
        IS_TESTING ? [] : ScheduledLogger.logExternalServicesStatsPeriodically,
        IS_TESTING ? [] : () => setInterval(() => LogsStorage.saveToTheDisk(), 10000),
    ].flat();

    initializers.forEach(initializer => {
        (async () => {
            try {
                await initializer();
            } catch (e) {
                logError(e, "initializer failed");
            }
        })();
    });
}
