import {
    AUTHENTICATION_DISCOVERED_EVENT,
    EventBus,
    LOGGED_OUT_EVENT,
    NEW_NOT_LOCAL_TRANSACTIONS_EVENT,
    NO_AUTHENTICATION_EVENT,
    SIGNED_IN_EVENT,
    SIGNED_UP_EVENT,
    THERE_IS_SESSION_ON_APP_INITIALIZATION_EVENT,
    TRANSACTION_PUSHED_EVENT,
    TX_DATA_RETRIEVED_EVENT,
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
} from "../internal/storage";
import PaymentService from "../paymentService";
import AddressesServiceInternal from "../internal/addressesServiceInternal";
import { isCurrentSessionValid, isJustLoggedOut } from "../authService";
import { addressesMetadataService } from "../internal/addressesMetadataService";
import { IS_TESTING } from "../../../properties";
import { setupAnalyticsMediators } from "./trackersMediators";

function initializeTransactionsProvider() {
    (async () => {
        try {
            const isSessionValid = await isCurrentSessionValid();
            if (isSessionValid) {
                const addresses = await AddressesServiceInternal.getAllUsedAddresses();
                await transactionsDataProvider.initialize([...addresses.internal, ...addresses.external]);
            }
        } catch (e) {
            logError(e, null, "Failed to initialize transactions data provider");
        }
    })();
}

export function setupMediators(
    handleNotFoundSession,
    handleLogout,
    handleNewNotLocalTxs,
    handleDiscoveredAuthentication
) {
    try {
        setupAnalyticsMediators();

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
                        logError(e, "tx data retrieved event handler");
                    }
                })();
            });

        EventBus.addEventListener(TRANSACTION_PUSHED_EVENT, (event, txid) => {
            (async () => {
                try {
                    const transactionData = await transactionsDataProvider.getTransactionData(txid);
                    // TODO: [bug, critical] This is workaround for weird date bug. Check in prod and remove if possible
                    // eslint-disable-next-line no-console
                    console.log("BUG_TXXS_DATE_NEW " + JSON.stringify(transactionData));
                    if (!transactionData.time) {
                        transactionData.time = Date.now();
                    }
                    await transactionsDataProvider.updateTransactionsCacheAndPushTxsToServer([transactionData]);
                } catch (e) {
                    logError(e, "Failed to push data of newly created transaction to transactions cache");
                }
            })();
        });

        EventBus.addEventListener(NEW_NOT_LOCAL_TRANSACTIONS_EVENT, handleNewNotLocalTxs);

        EventBus.addEventListener(AUTHENTICATION_DISCOVERED_EVENT, handleDiscoveredAuthentication);
    } catch (e) {
        logError(e);
    }
}
