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
import ChangeAddressUpdateSchedulingService from "../../../wallet/btc/services/changeAddressUpdateSchedulingService";
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
import { isCurrentSessionValid, isJustLoggedOut } from "../../../auth/services/authService";
import { addressesMetadataService } from "../../../wallet/btc/services/internal/addressesMetadataService";
import { IS_TESTING } from "../../../../properties";
import { setupAnalyticsMediators } from "./trackersMediators";
import { Logger } from "../../../support/services/internal/logs/logger";
import { logWalletDataSlice } from "../../../support/services/internal/logs/scheduledLogger";
import { LogsStorage } from "../../../support/services/internal/logs/logsStorage";
import AddressesService from "../../../wallet/btc/services/addressesService";
import { PreferencesService } from "../../../wallet/common/services/preferencesService";
import { BalancesService } from "../../../wallet/common/services/balancesService";
import { CoinsListService } from "../../../wallet/common/services/coinsListService";
import TransactionsHistoryService from "../../../wallet/common/services/transactionsHistoryService";
import { Coins } from "../../../wallet/coins";

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

        !IS_TESTING &&
            [SIGNED_IN_EVENT, SIGNED_UP_EVENT].forEach(event => {
                EventBus.addEventListener(event, () => saveIsNotFoundSessionMessageShownForLastLostSession(false));
                EventBus.addEventListener(event, initializeTransactionsProvider);
                EventBus.addEventListener(event, async function() {
                    await CoinsListService.getOrderedCoinsDataWithFiat();
                });
                EventBus.addEventListener(event, async function() {
                    await TransactionsHistoryService.getTransactionsList(
                        Coins.getSupportedCoinsTickers(),
                        Number.MAX_SAFE_INTEGER
                    );
                });
                EventBus.addEventListener(event, () =>
                    ChangeAddressUpdateSchedulingService.scheduleChangeAddressUpdates()
                );
                EventBus.addEventListener(event, async function() {
                    await AddressesService.getCurrentExternalAddress();
                });
            });

        !IS_TESTING &&
            EventBus.addEventListener(THERE_IS_SESSION_ON_APP_INITIALIZATION_EVENT, async function() {
                await AddressesService.getCurrentExternalAddress();
            });

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

        [LOGGED_OUT_EVENT, NO_AUTHENTICATION_EVENT].forEach(event =>
            EventBus.addEventListener(event, () => {
                try {
                    ChangeAddressUpdateSchedulingService.removeScheduledChangeAddressUpdating();
                    transactionsDataProvider.resetState();
                    addressesMetadataService.clearMetadata();
                } catch (e) {
                    logError(e);
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

        !IS_TESTING &&
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

        EventBus.addEventListener(NEW_NOT_LOCAL_TRANSACTIONS_EVENT, function() {
            AddressesService.invalidateCaches();
        });

        EventBus.addEventListener(NEW_NOT_LOCAL_TRANSACTIONS_EVENT, handleNewNotLocalTxs);

        [TRANSACTION_PUSHED_EVENT, TX_DATA_RETRIEVED_EVENT, NEW_NOT_LOCAL_TRANSACTIONS_EVENT].forEach(event => {
            EventBus.addEventListener(event, function() {
                TransactionsHistoryService.invalidateCaches();
                BalancesService.invalidateCaches();
                CoinsListService.invalidateCaches();
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
            if (doNotRemoveClientLogsWhenSignedOut?.value != null) {
                setDoNotRemoveClientLogsWhenSignedOut("" + doNotRemoveClientLogsWhenSignedOut.value);
            }
        });

        Logger.log("Successfully initialized mediators", loggerSource);
    } catch (e) {
        logError(e, loggerSource);
    }
}
