export class SwapProvider {
    static COMMON_ERRORS = {
        REQUESTS_LIMIT_EXCEEDED: "requestsLimitExceeded",
    };

    static NO_SWAPS_REASONS = {
        TOO_LOW: "tooLow",
        TOO_HIGH: "tooHigh",
        NOT_SUPPORTED: "notSupported",
    };

    static CREATION_FAIL_REASONS = {
        RETRIABLE_FAIL: "retriableFail",
    };

    // TODO: [dev] finish
    static SWAP_STATUSES = {
        WAITING_FOR_PAYMENT: "waiting_for_payment", // public +
        PAYMENT_RECEIVED: "payment_received", // public +
        EXCHANGING: "exchanging", // session full // public +
        COMPLETED: "completed", // session full  // public +
        REFUNDED: "refunded", // session full  // public +
        EXPIRED: "expired", // public +
        ERROR: "error", // public +
    };

    /**
     * @return {number} milliseconds TTL
     */
    getSwapDetailsTtlMs() {
        throw new Error("Not implemented in base");
    }

    /**
     * Retrieves all currencies supported by this swap provider
     * Returns one of SwapProvider.COMMON_ERRORS in case of processable fail.
     *
     * @return {Promise<({ result: true, coins: Coin[] }|{ result: false, reason: string })>}
     */
    async getSupportedCurrencies() {
        throw new Error("Not implemented in base");
    }

    /**
     * Retrieves estimation for swapping giving coins amount.
     * null min or max signals there is no corresponding limitation. undefined means that the limits were not retrieved.
     * For fail result on of SwapProvider.NO_SWAPS_REASONS or SwapProvider.COMMON_ERRORS reasons will be returned.
     *
     * @param fromCoin {Coin}
     * @param toCoin {Coin}
     * @param amountCoins {number}
     * @return {Promise<({
     *            result: false,
     *            reason: string,
     *            smallestMin: (number|null|undefined),
     *            greatestMax: (number|null|undefined),
     *         }|{
     *            result: true,
     *            min: (number|null),
     *            max: (number|null),
     *            smallestMin: (number|null),
     *            greatestMax: (number|null),
     *            rate: number,
     *            durationMinutesRange: string,
     *            [rawSwapData]: Object
     *         })>}
     */
    async getSwapInfo(fromCoin, toCoin, amountCoins) {
        throw new Error("Not implemented in base");
    }

    /**
     * For fail result we return one of SwapProvider.CREATION_FAIL_REASONS or SwapProvider.COMMON_ERRORS.
     *
     * @param fromCoin {Coin}
     * @param toCoin {Coin}
     * @param amount {number}
     * @param toAddress {string}
     * @param refundAddress {string}
     * @param rawSwapData {Object|null}
     * @return {Promise<({
     *                     result: true,
     *                     swapId: string,
     *                     fromCoin: Coin,
     *                     fromAmount: number,
     *                     fromAddress: string,
     *                     toCoin: Coin,
     *                     toAmount: number,
     *                     toAddress: string,
     *                     rate: number
     *                 }|{
     *                     result: false,
     *                     reason: string,
     *                     partner: string
     *                 })>}
     */
    async createSwap(fromCoin, toCoin, amount, toAddress, refundAddress, rawSwapData = null) {
        throw new Error("Not implemented in base");
    }

    /**
     * Retrieves details and status for swaps by given ids.
     *
     * @param swapIds {string[]}
     * @return {Promise<{result: false, reason: string}|{result:true, swaps: ExistingSwap[]}>}
     */
    async getExistingSwapsDetailsAndStatus(swapIds) {
        throw new Error("Not implemented in base");
    }
}
