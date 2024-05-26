import { BaseSwapCreationInfo } from "@rabbitio/ui-kit";

export class SwapCreationInfo extends BaseSwapCreationInfo {
    /**
     * @param fromCoin {Coin}
     * @param toCoin {Coin}
     * @param fromAmountCoins {string}
     * @param toAmountCoins {string}
     * @param feeCoin {Coin}
     * @param feeCoins {string}
     * @param feeFiat {number}
     * @param rate {string}
     * @param rawSwapData {Object}
     * @param min {string|null}
     * @param fiatMin {number|null}
     * @param max {string|null}
     * @param fiatMax {number|null}
     * @param txData {TxData}
     * @param durationMinutesRange {string}
     * @param fixed {boolean}
     */
    constructor(
        fromCoin,
        toCoin,
        fromAmountCoins,
        toAmountCoins,
        feeCoin,
        feeCoins,
        feeFiat,
        rate,
        rawSwapData,
        min,
        fiatMin,
        max,
        fiatMax,
        txData,
        durationMinutesRange,
        fixed
    ) {
        super(
            fromCoin,
            toCoin,
            fromAmountCoins,
            toAmountCoins,
            rate,
            rawSwapData,
            min,
            fiatMin,
            max,
            fiatMax,
            durationMinutesRange,
            fixed
        );
        this.feeCoin = feeCoin;
        this.feeCoins = feeCoins;
        this.feeFiat = feeFiat;
        this.txData = txData;
    }
}
