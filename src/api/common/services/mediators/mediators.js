import {
    AUTHENTICATION_DISCOVERED_EVENT,
    CURRENT_PREFERENCES_EVENT,
    EventBus,
    FIAT_CURRENCY_CHANGED_EVENT,
    LOGGED_OUT_EVENT,
    NEW_ADDRESS_CREATED_EVENT,
    NEW_NOT_LOCAL_TRANSACTIONS_EVENT,
    NO_AUTHENTICATION_EVENT,
    SIGNED_IN_EVENT,
    SIGNED_UP_EVENT,
    THERE_IS_NO_SESSION_ON_APP_INITIALIZATION_EVENT,
    THERE_IS_SESSION_ON_APP_INITIALIZATION_EVENT,
    TRANSACTION_PUSHED_EVENT,
    TX_DATA_RETRIEVED_EVENT,
    USER_READY_TO_SEND_TRANSACTION_EVENT,
    WALLET_DATA_EXPORTED_EVENT,
    WALLET_DELETED_EVENT,
    WALLET_IMPORTED_EVENT,
} from "../../adapters/eventbus";
import { improveAndRethrow, logError } from "../../utils/errorUtils";
import { transactionsDataProvider } from "../../../wallet/btc/services/internal/transactionsDataProvider";
import UtxosService from "../../../wallet/btc/services/internal/utxosService";
import { getCurrentSmallestFeeRate } from "../../../wallet/btc/services/feeRatesService";
import {
    getCurrentNetwork,
    getIsNotFoundSessionMessageShownForLastLostSession,
    saveIsNotFoundSessionMessageShownForLastLostSession,
    setDoNotRemoveClientLogsWhenSignedOut,
} from "../internal/storage";
import PaymentService from "../../../wallet/btc/services/paymentService";
import AddressesServiceInternal from "../../../wallet/btc/services/internal/addressesServiceInternal";
import { isJustLoggedOut } from "../../../auth/services/authService";
import { addressesMetadataService } from "../../../wallet/btc/services/internal/addressesMetadataService";
import { IS_TESTING } from "../../../../properties";
import { setupAnalyticsMediators } from "./trackersMediators";
import { Logger } from "../../../support/services/internal/logs/logger";
import { logWalletDataSlice } from "../../../support/services/internal/logs/scheduledLogger";
import { LogsStorage } from "../../../support/services/internal/logs/logsStorage";
import AddressesService from "../../../wallet/btc/services/addressesService";
import { CoinsListService } from "../../../wallet/common/services/coinsListService";
import TransactionsHistoryService from "../../../wallet/common/services/transactionsHistoryService";
import { Coins } from "../../../wallet/coins";
import { UserDataAndSettings } from "../../../wallet/common/models/userDataAndSettings";
import { PreferencesService } from "../../../wallet/common/services/preferencesService";

function initializeTransactionsProvider() {
    const loggerSource = "initializeTransactionsProvider";
    (async () => {
        try {
            Logger.log("Start initializing transactions provider", loggerSource);

            const addresses = await AddressesServiceInternal.getAllUsedAddresses();
            const allAddresses = [...addresses.internal, ...addresses.external];

            Logger.log(`Initializing for ${allAddresses.length} addresses`, loggerSource);

            await transactionsDataProvider.initialize(allAddresses);

            Logger.log("Successfully initialized", loggerSource);
        } catch (e) {
            logError(e, loggerSource, "Failed to initialize transactions data provider");
        }
    })();
}

// TODO: [refactoring, moderate] wrap event listeners into neat functions for readability
export function setupMediators(
    handleNotFoundSession,
    handleLogout,
    handleNewNotLocalTxs,
    handleDiscoveredAuthentication
) {
    const loggerSource = "setupMediators";
    try {
        Logger.log("Start initializing mediators", loggerSource);

        !IS_TESTING && setupAnalyticsMediators();

        !IS_TESTING &&
            [
                SIGNED_IN_EVENT,
                SIGNED_UP_EVENT,
                WALLET_IMPORTED_EVENT,
                THERE_IS_SESSION_ON_APP_INITIALIZATION_EVENT,
            ].forEach(event => {
                try {
                    EventBus.addEventListener(event, () => saveIsNotFoundSessionMessageShownForLastLostSession(false));
                    EventBus.addEventListener(event, initializeTransactionsProvider);
                    EventBus.addEventListener(event, async function() {
                        await CoinsListService.getEnabledCoinsSortedByFiatBalance();
                    });
                    EventBus.addEventListener(event, async function() {
                        await TransactionsHistoryService.getTransactionsList(
                            Coins.getEnabledCoinsTickers(),
                            Number.MAX_SAFE_INTEGER
                        );
                    });
                    EventBus.addEventListener(event, async function() {
                        await AddressesService.getCurrentExternalAddress();
                    });
                    PreferencesService.scheduleWalletDataSynchronization();
                } catch (e) {
                    improveAndRethrow(e, event + " handler");
                }
            });

        EventBus.addEventListener(NO_AUTHENTICATION_EVENT, async () => {
            try {
                if (isJustLoggedOut()) return;
                if (!getIsNotFoundSessionMessageShownForLastLostSession()) {
                    saveIsNotFoundSessionMessageShownForLastLostSession(true);
                    handleNotFoundSession();
                    handleLogout();
                }
            } catch (e) {
                try {
                    logError(e, "NO_AUTHENTICATION_EVENT_handler");
                    saveIsNotFoundSessionMessageShownForLastLostSession(true);
                    handleNotFoundSession();
                    handleLogout();
                } catch (e) {
                    logError(e, "NO_AUTHENTICATION_EVENT_handler error handling");
                }
            }
        });

        EventBus.addEventListener(LOGGED_OUT_EVENT, () => {
            try {
                handleLogout();
            } catch (e) {
                logError(e, "LOGGED_OUT_EVENT listener");
            }
        });

        [LOGGED_OUT_EVENT, NO_AUTHENTICATION_EVENT].forEach(event =>
            EventBus.addEventListener(event, () => {
                try {
                    transactionsDataProvider.resetState();
                    addressesMetadataService.clearMetadata();
                    PreferencesService.removeWalletDataSyncInterval();
                } catch (e) {
                    logError(e, event + "_handler");
                }
            })
        );

        !IS_TESTING &&
            EventBus.addEventListener(TX_DATA_RETRIEVED_EVENT, () => {
                (async () => {
                    try {
                        const rate = await getCurrentSmallestFeeRate(
                            getCurrentNetwork(),
                            PaymentService.BLOCKS_COUNTS_FOR_OPTIONS
                        );
                        await UtxosService.calculateBalance(rate, true);
                    } catch (e) {
                        logError(e, `${TX_DATA_RETRIEVED_EVENT}_handler`);
                    }
                })();
            });

        EventBus.addEventListener(NEW_NOT_LOCAL_TRANSACTIONS_EVENT, function() {
            try {
                AddressesService.invalidateCaches();
            } catch (e) {
                logError(e, NEW_NOT_LOCAL_TRANSACTIONS_EVENT + "_handler");
            }
        });

        EventBus.addEventListener(NEW_NOT_LOCAL_TRANSACTIONS_EVENT, () => {
            try {
                handleNewNotLocalTxs();
            } catch (e) {
                logError(e, `${NEW_NOT_LOCAL_TRANSACTIONS_EVENT}_handler`);
            }
        });

        [
            TRANSACTION_PUSHED_EVENT,
            TX_DATA_RETRIEVED_EVENT,
            NEW_NOT_LOCAL_TRANSACTIONS_EVENT,
            FIAT_CURRENCY_CHANGED_EVENT,
        ].forEach(event => {
            EventBus.addEventListener(event, function() {
                try {
                    CoinsListService.invalidateCaches();
                } catch (e) {
                    logError(e, event + "_handler");
                }
            });
        });

        !IS_TESTING &&
            [
                WALLET_IMPORTED_EVENT,
                SIGNED_IN_EVENT,
                TRANSACTION_PUSHED_EVENT,
                THERE_IS_SESSION_ON_APP_INITIALIZATION_EVENT,
                AUTHENTICATION_DISCOVERED_EVENT,
                WALLET_DATA_EXPORTED_EVENT,
                NEW_ADDRESS_CREATED_EVENT,
                USER_READY_TO_SEND_TRANSACTION_EVENT,
            ].forEach(event =>
                EventBus.addEventListener(event, () => {
                    (async () => {
                        try {
                            await logWalletDataSlice();
                        } catch (e) {
                            logError(e, event + "_handler-slice");
                        }
                    })();
                })
            );

        EventBus.addEventListener(AUTHENTICATION_DISCOVERED_EVENT, () => {
            try {
                handleDiscoveredAuthentication();
            } catch (e) {
                logError(e, AUTHENTICATION_DISCOVERED_EVENT + "_handler");
            }
        });

        [
            LOGGED_OUT_EVENT,
            NO_AUTHENTICATION_EVENT,
            THERE_IS_NO_SESSION_ON_APP_INITIALIZATION_EVENT,
            WALLET_DELETED_EVENT,
        ].forEach(event =>
            EventBus.addEventListener(event, () => {
                try {
                    LogsStorage.removeAllClientLogs();
                } catch (e) {
                    logError(e, event + "_handler-remove-logs");
                }
            })
        );

        EventBus.addEventListener(CURRENT_PREFERENCES_EVENT, (event, data) => {
            try {
                const doNotRemoveClientLogsWhenSignedOut = [data]
                    .flat()
                    .find(
                        item => item?.setting === UserDataAndSettings.SETTINGS.DONT_REMOVE_CLIENT_LOGS_WHEN_SIGNED_OUT
                    );
                if (doNotRemoveClientLogsWhenSignedOut?.value != null) {
                    setDoNotRemoveClientLogsWhenSignedOut("" + doNotRemoveClientLogsWhenSignedOut.value);
                }
            } catch (e) {
                logError(e, CURRENT_PREFERENCES_EVENT + "_handler");
            }
        });

        Logger.log("Successfully initialized mediators", loggerSource);
    } catch (e) {
        logError(e, loggerSource);
    }
}
