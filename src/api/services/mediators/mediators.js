import {
    AUTHENTICATION_DISCOVERED_EVENT,
    CURRENT_PREFERENCES_EVENT,
    EventBus,
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
import { logError } from "../../utils/errorUtils";
import ChangeAddressUpdateSchedulingService from "../changeAddressUpdateSchedulingService";
import { transactionsDataProvider } from "../internal/transactionsDataProvider";
import UtxosService from "../internal/utxosService";
import { getCurrentSmallestFeeRate } from "../feeRatesService";
import {
    getCurrentNetwork,
    getIsNotFoundSessionMessageShownForLastLostSession,
    saveIsNotFoundSessionMessageShownForLastLostSession,
    setDoNotRemoveClientLogsWhenSignedOut,
} from "../internal/storage";
import PaymentService from "../paymentService";
import AddressesServiceInternal from "../internal/addressesServiceInternal";
import { isCurrentSessionValid, isJustLoggedOut } from "../authService";
import { addressesMetadataService } from "../internal/addressesMetadataService";
import { IS_TESTING } from "../../../properties";
import { setupAnalyticsMediators } from "./trackersMediators";
import { Logger } from "../internal/logs/logger";
import { logWalletDataSlice } from "../internal/logs/scheduledLogger";
import { LogsStorage } from "../internal/logs/logsStorage";
import { PreferencesService } from "../preferencesService";

function initializeTransactionsProvider() {
    const loggerSource = "initializeTransactionsProvider";
    (async () => {
        try {
            Logger.log("Start initializing transactions provider", loggerSource);

            const isSessionValid = await isCurrentSessionValid();
            if (isSessionValid) {
                const addresses = await AddressesServiceInternal.getAllUsedAddresses();
                const allAddresses = [...addresses.internal, ...addresses.external];

                Logger.log(`Initializing for ${allAddresses.length} addresses`, loggerSource);

                await transactionsDataProvider.initialize(allAddresses);

                Logger.log("Successfully initialized", loggerSource);
            } else {
                Logger.log("Session is not valid - stopped the initialization", loggerSource);
            }
        } catch (e) {
            logError(e, loggerSource, "Failed to initialize transactions data provider");
        }
    })();
}

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

        EventBus.addEventListener(SIGNED_IN_EVENT, () => saveIsNotFoundSessionMessageShownForLastLostSession(false));
        EventBus.addEventListener(SIGNED_UP_EVENT, () => saveIsNotFoundSessionMessageShownForLastLostSession(false));

        !IS_TESTING && EventBus.addEventListener(SIGNED_IN_EVENT, initializeTransactionsProvider);
        !IS_TESTING && EventBus.addEventListener(SIGNED_UP_EVENT, initializeTransactionsProvider);

        !IS_TESTING &&
            EventBus.addEventListener(THERE_IS_SESSION_ON_APP_INITIALIZATION_EVENT, initializeTransactionsProvider);

        EventBus.addEventListener(NO_AUTHENTICATION_EVENT, async () => {
            if (isJustLoggedOut()) return;

            try {
                if (!(await isCurrentSessionValid()) && !getIsNotFoundSessionMessageShownForLastLostSession()) {
                    saveIsNotFoundSessionMessageShownForLastLostSession(true);
                    handleNotFoundSession();
                    handleLogout();
                }
            } catch (e) {
                logError(e);
                saveIsNotFoundSessionMessageShownForLastLostSession(true);
                handleNotFoundSession();
                handleLogout();
            }
        });

        EventBus.addEventListener(LOGGED_OUT_EVENT, () => handleLogout());

        EventBus.addEventListener(LOGGED_OUT_EVENT, () => {
            try {
                ChangeAddressUpdateSchedulingService.removeScheduledChangeAddressUpdating();
                transactionsDataProvider.resetState();
                addressesMetadataService.clearMetadata();
            } catch (e) {
                logError(e);
            }
        });

        EventBus.addEventListener(NO_AUTHENTICATION_EVENT, () => {
            try {
                ChangeAddressUpdateSchedulingService.removeScheduledChangeAddressUpdating();
                transactionsDataProvider.resetState();
                addressesMetadataService.clearMetadata();
            } catch (e) {
                logError(e);
            }
        });

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

        EventBus.addEventListener(TRANSACTION_PUSHED_EVENT, (event, txid) => {
            (async () => {
                try {
                    const transactionData = await transactionsDataProvider.getTransactionData(txid);
                    await transactionsDataProvider.updateTransactionsCacheAndPushTxsToServer([transactionData]);
                } catch (e) {
                    logError(
                        e,
                        `${TRANSACTION_PUSHED_EVENT}_handler`,
                        "Failed to push data of newly created transaction to transactions cache"
                    );
                }
            })();
        });

        EventBus.addEventListener(NEW_NOT_LOCAL_TRANSACTIONS_EVENT, handleNewNotLocalTxs);

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
            ].forEach(event => EventBus.addEventListener(event, logWalletDataSlice));

        EventBus.addEventListener(AUTHENTICATION_DISCOVERED_EVENT, handleDiscoveredAuthentication);

        [
            LOGGED_OUT_EVENT,
            NO_AUTHENTICATION_EVENT,
            THERE_IS_NO_SESSION_ON_APP_INITIALIZATION_EVENT,
            WALLET_DELETED_EVENT,
        ].forEach(event => EventBus.addEventListener(event, () => LogsStorage.removeAllClientLogs()));

        EventBus.addEventListener(CURRENT_PREFERENCES_EVENT, (event, data) => {
            const doNotRemoveClientLogsWhenSignedOut = [data]
                .flat()
                .find(
                    item => item.name === PreferencesService.PREFERENCES.DONT_REMOVE_CLIENT_LOGS_WHEN_SIGNED_OUT.name
                );
            if (doNotRemoveClientLogsWhenSignedOut.value != null) {
                setDoNotRemoveClientLogsWhenSignedOut("" + doNotRemoveClientLogsWhenSignedOut.value);
            }
        });

        Logger.log("Successfully initialized mediators", loggerSource);
    } catch (e) {
        logError(e, loggerSource);
    }
}
