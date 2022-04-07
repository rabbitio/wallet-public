import { setupMediators } from "./services/mediators/mediators";
import ClientIpHashService from "./services/clientIpHashService";
import BtcToFiatRatesService from "./services/btcToFiatRatesService";
import { registerThisWalletAsBitcoinProtocolHandler } from "./utils/browserUtils";
import { isCurrentSessionValid } from "./services/authService";
import ChangeAddressUpdateSchedulingService from "./services/changeAddressUpdateSchedulingService";
import { EventBus, THERE_IS_SESSION_ON_APP_INITIALIZATION_EVENT } from "./adapters/eventbus";
import { logError } from "./utils/errorUtils";
import PaymentUrlService from "./services/paymentUrlService";
import { blocksListener } from "./services/internal/blocksListener";
import { currentBlockService } from "./services/internal/currentBlockService";
import { IS_TESTING } from "../properties";
import { ScheduledLogger } from "./services/internal/logs/scheduledLogger";

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
                }
            })(),
        () => setupMediators(handleNotFoundSession, handleLogout, handleNewNotLocalTxs, handleDiscoveredAuthentication),
        () => BtcToFiatRatesService.scheduleBtcToFiatRatesUpdate(),
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
