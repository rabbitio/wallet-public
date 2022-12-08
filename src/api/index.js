import { setupMediators } from "./common/services/mediators/mediators";
import ClientIpHashService from "./auth/services/internal/clientIpHashService";
import CoinsToFiatRatesService from "./wallet/common/services/coinsToFiatRatesService";
import { registerThisWalletAsBitcoinProtocolHandler } from "./common/utils/browserUtils";
import { isCurrentSessionValid } from "./auth/services/authService";
import ChangeAddressUpdateSchedulingService from "./wallet/btc/services/changeAddressUpdateSchedulingService";
import {
    EventBus,
    THERE_IS_NO_SESSION_ON_APP_INITIALIZATION_EVENT,
    THERE_IS_SESSION_ON_APP_INITIALIZATION_EVENT,
} from "./common/adapters/eventbus";
import { logError } from "./common/utils/errorUtils";
import PaymentUrlService from "./wallet/btc/services/paymentUrlService";
import { blocksListener } from "./wallet/btc/services/internal/blocksListener";
import { currentBlockService } from "./wallet/btc/services/internal/currentBlockService";
import { IS_TESTING } from "../properties";
import { ScheduledLogger } from "./support/services/internal/logs/scheduledLogger";
import { LogsStorage } from "./support/services/internal/logs/logsStorage";

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
                if (await isCurrentSessionValid()) {
                    EventBus.dispatch(THERE_IS_SESSION_ON_APP_INITIALIZATION_EVENT);
                } else {
                    EventBus.dispatch(THERE_IS_NO_SESSION_ON_APP_INITIALIZATION_EVENT);
                }
            })(),
        () => setupMediators(handleNotFoundSession, handleLogout, handleNewNotLocalTxs, handleDiscoveredAuthentication),
        () => CoinsToFiatRatesService.scheduleCoinsToFiatRatesUpdate(),
        IS_TESTING
            ? []
            : () =>
                  registerThisWalletAsBitcoinProtocolHandler(
                      PaymentUrlService.URL_PARAMETER_NAME,
                      PaymentUrlService.URL_PATH
                  ),
        IS_TESTING
            ? []
            : async () => {
                  try {
                      if (await isCurrentSessionValid()) {
                          ChangeAddressUpdateSchedulingService.scheduleChangeAddressUpdates();
                      } else {
                          ChangeAddressUpdateSchedulingService.removeScheduledChangeAddressUpdating();
                      }
                  } catch (e) {
                      logError(e);
                  }
              },
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
                logError(e);
            }
        })();
    });
}
