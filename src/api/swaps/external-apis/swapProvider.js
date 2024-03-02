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

    static SWAP_STATUSES = {
        WAITING_FOR_PAYMENT: "waiting_for_payment", // public +
        CONFIRMING: "confirming",
        PAYMENT_RECEIVED: "payment_received", // public +
        EXCHANGING: "exchanging", // session full // public +
        COMPLETED: "completed", // session full  // public +
        REFUNDED: "refunded", // session full  // public +
        EXPIRED: "expired", // public +
        FAILED: "failed", // public +
    };

    /**
     * @return {number} milliseconds TTL
     */
    getSwapCreationInfoTtlMs() {
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
     * @param amountCoins {string}
     * @return {Promise<({
     *            result: false,
     *            reason: string,
     *            smallestMin: (string|null|undefined),
     *            greatestMax: (string|null|undefined),
     *         }|{
     *            result: true,
     *            min: (string|null),
     *            max: (string|null),
     *            smallestMin: (string|null),
     *            greatestMax: (string|null),
     *            rate: (string|null),
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
     * @param amount {string}
     * @param toAddress {string}
     * @param refundAddress {string}
     * @param rawSwapData {Object|null}
     * @return {Promise<({
     *                     result: true,
     *                     swapId: string,
     *                     fromCoin: Coin,
     *                     fromAmount: string,
     *                     fromAddress: string,
     *                     toCoin: Coin,
     *                     toAmount: string,
     *                     toAddress: string,
     *                     rate: string
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
     * If some swap is not found by id then there is no item in return list.
     *
     * @param swapIds {string[]}
     * @return {Promise<{result: false, reason: string}|{result:true, swaps: ExistingSwap[]}>}
     */
    async getExistingSwapsDetailsAndStatus(swapIds) {
        throw new Error("Not implemented in base");
    }
}
