import { improveAndRethrow, Logger, LogsStorage } from "@rabbitio/ui-kit";

import {
    AUTHENTICATION_DISCOVERED_EVENT,
    BALANCE_CHANGED_EXTERNALLY_EVENT,
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
    USER_READY_TO_SEND_TRANSACTION_EVENT,
    WALLET_DATA_EXPORTED_EVENT,
    WALLET_DELETED_EVENT,
    WALLET_IMPORTED_EVENT,
} from "../../adapters/eventbus.js";
import { transactionsDataProvider } from "../../../wallet/btc/services/internal/transactionsDataProvider.js";
import UtxosService from "../../../wallet/btc/services/internal/utxosService.js";
import { getCurrentSmallestFeeRate } from "../../../wallet/btc/services/feeRatesService.js";
import { Storage } from "../internal/storage.js";
import PaymentService from "../../../wallet/btc/services/paymentService.js";
import { isJustLoggedOut } from "../../../auth/services/authService.js";
import { IS_TESTING } from "../../../../properties.js";
import { setupAnalyticsMediators } from "./trackersMediators.js";
import { logWalletDataSlice } from "../../../support/services/internal/logs/scheduledLogger.js";
import AddressesService from "../../../wallet/btc/services/addressesService.js";
import { CoinsListService } from "../../../wallet/common/services/coinsListService.js";
import TransactionsHistoryService from "../../../wallet/common/services/transactionsHistoryService.js";
import { Coins } from "../../../wallet/coins.js";
import { UserDataAndSettings } from "../../../wallet/common/models/userDataAndSettings.js";
import { PreferencesService } from "../../../wallet/common/services/preferencesService.js";
import { BalancesService } from "../../../wallet/common/services/balancesService.js";
import { Wallets } from "../../../wallet/common/wallets.js";

function initializeTransactionsProvider() {
    const loggerSource = "initializeTransactionsProvider";
    (async () => {
        try {
            Logger.log("Start initializing transactions provider", loggerSource);

            await transactionsDataProvider.initialize();

            Logger.log("Successfully initialized", loggerSource);
        } catch (e) {
            Logger.logError(e, loggerSource, "Failed to initialize transactions data provider");
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
                // Initialization activities
                try {
                    EventBus.addEventListener(event, () =>
                        Storage.saveIsNotFoundSessionMessageShownForLastLostSession(false)
                    );
                    EventBus.addEventListener(event, initializeTransactionsProvider);
                    EventBus.addEventListener(event, async function () {
                        await CoinsListService.getEnabledCoinsSortedByFiatBalance();
                    });
                    EventBus.addEventListener(event, async function () {
                        await TransactionsHistoryService.getTransactionsList(
                            Coins.getEnabledCoinsTickers(),
                            Number.MAX_SAFE_INTEGER
                        );
                    });
                    EventBus.addEventListener(event, async function () {
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
                if (!Storage.getIsNotFoundSessionMessageShownForLastLostSession()) {
                    Storage.saveIsNotFoundSessionMessageShownForLastLostSession(true);
                    handleNotFoundSession();
                    handleLogout();
                }
            } catch (e) {
                try {
                    Logger.logError(e, "NO_AUTHENTICATION_EVENT_handler");
                    Storage.saveIsNotFoundSessionMessageShownForLastLostSession(true);
                    handleNotFoundSession();
                    handleLogout();
                } catch (e) {
                    Logger.logError(e, "NO_AUTHENTICATION_EVENT_handler error handling");
                }
            }
        });

        EventBus.addEventListener(LOGGED_OUT_EVENT, () => {
            try {
                handleLogout();
            } catch (e) {
                Logger.logError(e, "LOGGED_OUT_EVENT listener");
            }
        });

        [LOGGED_OUT_EVENT, NO_AUTHENTICATION_EVENT].forEach(event =>
            EventBus.addEventListener(event, () => {
                try {
                    transactionsDataProvider.resetState();
                    PreferencesService.removeWalletDataSyncInterval();
                } catch (e) {
                    Logger.logError(e, event + "_handler");
                }
            })
        );

        !IS_TESTING &&
            EventBus.addEventListener(NEW_NOT_LOCAL_TRANSACTIONS_EVENT, (event, data) => {
                (async () => {
                    try {
                        const coins = (data ?? []).map(tx => Coins.getCoinByTicker(tx.ticker));
                        const thereAreNewBtcTransactions = coins.find(coin => coin.ticker === Coins.COINS.BTC.ticker);
                        if (thereAreNewBtcTransactions) {
                            const rate = await getCurrentSmallestFeeRate(
                                Storage.getCurrentNetwork(),
                                PaymentService.BLOCKS_COUNTS_FOR_OPTIONS
                            );
                            await UtxosService.calculateBalance(rate, true);
                        }
                    } catch (e) {
                        Logger.logError(e, `${NEW_NOT_LOCAL_TRANSACTIONS_EVENT}_handler`);
                    }
                })();
            });

        [NEW_NOT_LOCAL_TRANSACTIONS_EVENT, BALANCE_CHANGED_EXTERNALLY_EVENT].forEach(eventType => {
            EventBus.addEventListener(eventType, (event, data) => {
                try {
                    // Here we are clearing high level caches for services providing data for all coins
                    BalancesService.invalidateCaches();
                    CoinsListService.invalidateCaches();
                    TransactionsHistoryService.invalidateCaches();

                    // Here we are marking as expired low level caches for services providing data for specific coins
                    if (event.type === NEW_NOT_LOCAL_TRANSACTIONS_EVENT) {
                        const coins = (data ?? []).map(tx => Coins.getCoinByTicker(tx.ticker));
                        const processedCoins = [];
                        for (let i = 0; i < coins.length; ++i) {
                            if (!processedCoins.find(procCoin => procCoin === coins[i])) {
                                Wallets.getWalletByCoin(coins[i]).markBalanceCacheAsExpired();
                            }
                            processedCoins.push(coins[i]);
                        }
                    } else if (event.type === BALANCE_CHANGED_EXTERNALLY_EVENT) {
                        const coins = (data ?? []).map(ticker => Coins.getCoinByTicker(ticker));
                        const processedCoins = [];
                        for (let i = 0; i < coins.length; ++i) {
                            if (!processedCoins.find(procCoin => procCoin === coins[i])) {
                                Wallets.getWalletByCoin(coins[i]).markTransactionsCacheAsExpired();
                            }
                            processedCoins.push(coins[i]);
                        }
                    }

                    // Then we call UI action at last order to use results of all the processing performed above (caches removal/expiration)
                    handleNewNotLocalTxs();
                } catch (e) {
                    Logger.logError(e, `${event.type}_handler`);
                }
            });
        });

        [TRANSACTION_PUSHED_EVENT, FIAT_CURRENCY_CHANGED_EVENT].forEach(event => {
            EventBus.addEventListener(event, function () {
                try {
                    BalancesService.invalidateCaches();
                    CoinsListService.invalidateCaches();
                    TransactionsHistoryService.invalidateCaches();
                } catch (e) {
                    Logger.logError(e, event + "_handler");
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
                            Logger.logError(e, event + "_handler-slice");
                        }
                    })();
                })
            );

        EventBus.addEventListener(AUTHENTICATION_DISCOVERED_EVENT, () => {
            try {
                handleDiscoveredAuthentication();
            } catch (e) {
                Logger.logError(e, AUTHENTICATION_DISCOVERED_EVENT + "_handler");
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
                    Logger.logError(e, event + "_handler-remove-logs");
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
                    LogsStorage.setDoNotRemoveClientLogsWhenSignedOut("" + doNotRemoveClientLogsWhenSignedOut.value);
                }
            } catch (e) {
                Logger.logError(e, CURRENT_PREFERENCES_EVENT + "_handler");
            }
        });

        Logger.log("Successfully initialized mediators", loggerSource);
    } catch (e) {
        Logger.logError(e, loggerSource);
    }
}
