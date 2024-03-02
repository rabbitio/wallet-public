export class PublicSwapCreationInfo {
    /**
     * @param fromCoin {Coin}
     * @param toCoin {Coin}
     * @param fromAmountCoins {string}
     * @param toAmountCoins {string}
     * @param rate {string}
     * @param rawSwapData {Object}
     * @param min {string}
     * @param fiatMin {number}
     * @param max {string}
     * @param fiatMax {number}
     * @param durationMinutesRange {string}
     */
    constructor(
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
        durationMinutesRange
    ) {
        this.fromCoin = fromCoin;
        this.toCoin = toCoin;
        this.fromAmountCoins = fromAmountCoins;
        this.toAmountCoins = toAmountCoins;
        this.rate = rate;
        this.rawSwapData = rawSwapData;
        this.min = min;
        this.fiatMin = fiatMin;
        this.max = max;
        this.fiatMax = fiatMax;
        this.durationMinutesRange = durationMinutesRange;
    }
}
