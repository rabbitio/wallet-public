import {
    EventBus,
    SIGNED_IN_EVENT,
    SIGNED_UP_EVENT,
    TRANSACTION_PUSHED_EVENT,
    WALLET_IMPORTED_EVENT,
} from "../../adapters/eventbus";
import { getWalletId } from "../internal/storage";
import { logError } from "../../utils/errorUtils";
import TransactionsHistoryService from "../transactionsHistoryService";
import { Logger } from "../internal/logs/logger";

const MEASUREMENT_ID = "G-VDHZL5BZCR";

export const setupAnalyticsMediators = () => {
    const loggerSource = "setupAnalyticsMediators";
    Logger.log("Start setting up analytics mediators", loggerSource);

    EventBus.addEventListener(SIGNED_UP_EVENT, () => {
        GoogleAnalyticsUtils.doActionOnGTag(["config", MEASUREMENT_ID, { user_id: getWalletId() }]);
        MixPanelUtils.identify(getWalletId());
    });

    EventBus.addEventListener(SIGNED_UP_EVENT, () => {
        const params = ["new_wallet", { wallet_creation_type: "manual" }];
        GoogleAnalyticsUtils.sendEvent(...params);
        MixPanelUtils.sendEvent(...params);
    });

    EventBus.addEventListener(SIGNED_IN_EVENT, () => {
        GoogleAnalyticsUtils.doActionOnGTag(["config", MEASUREMENT_ID, { user_id: getWalletId() }]);
        MixPanelUtils.identify(getWalletId());
    });

    EventBus.addEventListener(TRANSACTION_PUSHED_EVENT, (event, tx_id, tx_amount, tx_fee) => {
        const params = ["new_transaction", { tx_id, tx_amount, tx_fee, tx_type: "pushed_transaction" }];
        GoogleAnalyticsUtils.sendEvent(...params);
        MixPanelUtils.sendEvent(...params);
    });

    EventBus.addEventListener(WALLET_IMPORTED_EVENT, async event => {
        const params = ["new_wallet", { wallet_creation_type: "import" }];
        GoogleAnalyticsUtils.sendEvent(...params);
        MixPanelUtils.sendEvent(...params);
    });

    EventBus.addEventListener(WALLET_IMPORTED_EVENT, async event => {
        try {
            const result = await TransactionsHistoryService.getTransactionsList();
            result.transactions.forEach(tx => {
                const params = [
                    "new_transaction",
                    {
                        tx_id: tx.txid,
                        tx_amount: tx.amount,
                        tx_fee: tx.fee,
                        tx_type: "imported_transaction",
                    },
                ];
                GoogleAnalyticsUtils.sendEvent(...params);
                MixPanelUtils.sendEvent(...params);
            });
        } catch (e) {
            logError(e, "WALLET_IMPORTED_EVENT listener", "Failed to send events with imported transactions");
        }
    });

    Logger.log("Setting up analytics mediators done", loggerSource);
};

class GoogleAnalyticsUtils {
    static sendEvent(eventName, parameters) {
        GoogleAnalyticsUtils.doActionOnGTag(["event", eventName, parameters]);
    }

    static doActionOnGTag(parameters) {
        try {
            if (window.gtag) {
                window.gtag(...parameters);
            } else {
                logError(null, "doActionOnGTag", "No gtag found");
            }
        } catch (e) {
            logError(e, "doActionOnGTag", "Failed to do gtag action: " + JSON.stringify(parameters));
        }
    }
}

class MixPanelUtils {
    static sendEvent(eventName, parameters) {
        try {
            if (window.mixpanel) {
                const result = window.mixpanel.track(eventName, parameters);
                // eslint-disable-next-line no-console
                console.log("Mixpanel sendEvent result: " + result);
            } else {
                logError(null, "sendEvent", "No mixpanel found");
            }
        } catch (e) {
            logError(e, "sendEvent", "Failed to do mixpanel action: " + eventName + " - " + JSON.stringify(parameters));
        }
    }

    static identify(uniqueId) {
        try {
            if (window.mixpanel) {
                if (uniqueId) {
                    const result = window.mixpanel.identify(uniqueId);
                    // eslint-disable-next-line no-console
                    console.log("Mixpanel identify result: " + result);
                }
            } else {
                logError(null, "identify", "No mixpanel found");
            }
        } catch (e) {
            logError(e, "identify", "Failed to identify.");
        }
    }
}
