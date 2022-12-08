import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { Coins } from "../../coins";

export default class RampAssetConversionAdapter {
    /**
     * Returns ramp swapAsset property for widget using passed ticker.
     *
     * @param ticker - ticker to convert to swapAsset property
     * @return string - swapAsset property for the ramp widget
     *
     * @throws Error if conversion table doesn't have a conversion pair for the passed ticker
     */
    static convertTickerToSwapAsset(ticker) {
        const conversionTable = {};
        conversionTable[Coins.COINS.BTC.ticker] = "BTC_BTC";
        conversionTable[Coins.COINS.ETH.ticker] = "ETH_ETH";
        conversionTable[Coins.COINS.USDTERC20.ticker] = "ETH_USDT";

        try {
            if (typeof conversionTable[ticker] === "undefined")
                throw new Error("Unable to convert ticker " + ticker + " into ramp swapAsset.");
            return conversionTable[ticker];
        } catch (e) {
            improveAndRethrow(e, "convertTickerToSwapAsset");
        }
    }
}
