import { improveAndRethrow, Logger } from "@rabbitio/ui-kit";

import {
    EventBus,
    SIGNED_IN_EVENT,
    SIGNED_UP_EVENT,
    SWAP_CREATED_EVENT,
    SWAP_TX_PUSHED_EVENT,
    TRANSACTION_PUSHED_EVENT,
    WALLET_IMPORTED_EVENT,
} from "../../adapters/eventbus.js";
import { Storage } from "../internal/storage.js";
import CoinsToFiatRatesService from "../../../wallet/common/services/coinsToFiatRatesService.js";
import { Coins } from "../../../wallet/coins.js";

const MEASUREMENT_ID = "G-VDHZL5BZCR";

export const setupAnalyticsMediators = () => {
    const loggerSource = "setupAnalyticsMediators";
    Logger.log("Start setting up analytics mediators", loggerSource);

    EventBus.addEventListener(SIGNED_UP_EVENT, () => {
        GoogleAnalyticsUtils.doActionOnGTag(["config", MEASUREMENT_ID, { user_id: Storage.getWalletId() }]);
        MixPanelUtils.identify(Storage.getWalletId());
    });

    EventBus.addEventListener(SIGNED_UP_EVENT, () => {
        const params = ["new_wallet", { wallet_creation_type: "manual" }];
        GoogleAnalyticsUtils.sendEvent(...params);
        MixPanelUtils.sendEvent(...params);
    });

    EventBus.addEventListener(SIGNED_IN_EVENT, () => {
        GoogleAnalyticsUtils.doActionOnGTag(["config", MEASUREMENT_ID, { user_id: Storage.getWalletId() }]);
        MixPanelUtils.identify(Storage.getWalletId());
    });

    EventBus.addEventListener(TRANSACTION_PUSHED_EVENT, (event, tx_id, tx_amount, tx_fee, ticker) => {
        (async () => {
            try {
                const coinUsdRate = await CoinsToFiatRatesService.getCoinToUSDRate(Coins.getCoinByTicker(ticker));
                const usdAmount = +tx_amount * +coinUsdRate.rate;
                const params = [
                    "new_transaction",
                    { tx_id, tx_amount, usd_amount: usdAmount, tx_fee, coin: ticker, tx_type: "pushed_transaction" },
                ];

                GoogleAnalyticsUtils.sendEvent(...params);
                MixPanelUtils.sendEvent(...params);
            } catch (e) {
                improveAndRethrow(e, "TRANSACTION_PUSHED_EVENT handler in trackers");
            }
        })();
    });

    EventBus.addEventListener(WALLET_IMPORTED_EVENT, async event => {
        const params = ["new_wallet", { wallet_creation_type: "import" }];
        GoogleAnalyticsUtils.sendEvent(...params);
        MixPanelUtils.sendEvent(...params);
    });

    EventBus.addEventListener(SWAP_CREATED_EVENT, (event, fromTicker, toTicker, coinAmount) => {
        (async () => {
            try {
                const coinUsdRate = await CoinsToFiatRatesService.getCoinToUSDRate(Coins.getCoinByTicker(fromTicker));
                const usdAmount = +coinAmount * +coinUsdRate.rate;
                const params = [
                    "new_swap",
                    { coin_amount: coinAmount, usd_amount: usdAmount, fromCoin: fromTicker, toCoin: toTicker },
                ];

                GoogleAnalyticsUtils.sendEvent(...params);
                MixPanelUtils.sendEvent(...params);
            } catch (e) {
                improveAndRethrow(e, "SWAP_CREATED_EVENT handler in trackers");
            }
        })();
    });

    EventBus.addEventListener(SWAP_TX_PUSHED_EVENT, (event, fromTicker, coinAmount) => {
        (async () => {
            try {
                const coinUsdRate = await CoinsToFiatRatesService.getCoinToUSDRate(Coins.getCoinByTicker(fromTicker));
                const usdAmount = +coinAmount * +coinUsdRate.rate;
                const params = [
                    "new_swap_transaction",
                    { coin_amount: coinAmount, usd_amount: usdAmount, fromCoin: fromTicker },
                ];

                GoogleAnalyticsUtils.sendEvent(...params);
                MixPanelUtils.sendEvent(...params);
            } catch (e) {
                improveAndRethrow(e, "SWAP_TX_PUSHED_EVENT handler in trackers");
            }
        })();
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
                Logger.logError(null, "doActionOnGTag", "No gtag found");
            }
        } catch (e) {
            Logger.logError(e, "doActionOnGTag", "Failed to do gtag action: " + JSON.stringify(parameters));
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
                Logger.logError(null, "sendEvent", "No mixpanel found");
            }
        } catch (e) {
            Logger.logError(
                e,
                "sendEvent",
                "Failed to do mixpanel action: " + eventName + " - " + JSON.stringify(parameters)
            );
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
                Logger.logError(null, "identify", "No mixpanel found");
            }
        } catch (e) {
            Logger.logError(e, "identify", "Failed to identify.");
        }
    }
}
