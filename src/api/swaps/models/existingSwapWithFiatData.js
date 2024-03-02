import { ExistingSwap } from "./existingSwap.js";

export class ExistingSwapWithFiatData extends ExistingSwap {
    /**
     * @param swapId {string}
     * @param status {SwapProvider.SWAP_STATUSES}
     * @param createdAt {number}
     * @param expiresAt {number}
     * @param confirmations {number}
     * @param rate {string}
     * @param refundAddress {string}
     * @param fromCoin {Coin}
     * @param fromAmount {string}
     * @param fromTransactionId {string}
     * @param toCoin {Coin}
     * @param toAmount {string}
     * @param toTransactionId {string|null}
     * @param toAddress {string}
     * @param partner {string}
     * @param fromAmountFiat {number}
     * @param toAmountFiat {number}
     * @param fiatCurrencyCode {string}
     * @param fiatCurrencyDecimals {number}
     */
    constructor(
        swapId,
        status,
        createdAt,
        expiresAt,
        confirmations,
        rate,
        refundAddress,
        payToAddress,
        fromCoin,
        fromAmount,
        fromTransactionId,
        fromTransactionLink,
        toCoin,
        toAmount,
        toTransactionId,
        toTransactionLink,
        toAddress,
        partner,
        fromAmountFiat,
        toAmountFiat,
        fiatCurrencyCode,
        fiatCurrencyDecimals
    ) {
        super(
            swapId,
            status,
            createdAt,
            expiresAt,
            confirmations,
            rate,
            refundAddress,
            payToAddress,
            fromCoin,
            fromAmount,
            fromTransactionId,
            fromTransactionLink,
            toCoin,
            toAmount,
            toTransactionId,
            toTransactionLink,
            toAddress,
            partner
        );
        this.fromAmountFiat = fromAmountFiat;
        this.toAmountFiat = toAmountFiat;
        this.fiatCurrencyCode = fiatCurrencyCode;
        this.fiatCurrencyDecimals = fiatCurrencyDecimals;
    }

    /**
     * @param existingSwap {ExistingSwap}
     * @param fromAmountFiat {number}
     * @param toAmountFiat {number}
     * @param fiatCurrencyCode {string}
     * @param fiatCurrencyDecimals {number}
     * @return {ExistingSwapWithFiatData}
     */
    static fromExistingSwap(existingSwap, fromAmountFiat, toAmountFiat, fiatCurrencyCode, fiatCurrencyDecimals) {
        return new ExistingSwapWithFiatData(
            existingSwap.swapId,
            existingSwap.status,
            existingSwap.createdAt,
            existingSwap.expiresAt,
            existingSwap.confirmations,
            existingSwap.rate,
            existingSwap.refundAddress,
            existingSwap.payToAddress,
            existingSwap.fromCoin,
            existingSwap.fromAmount,
            existingSwap.fromTransactionId,
            existingSwap.fromTransactionLink,
            existingSwap.toCoin,
            existingSwap.toAmount,
            existingSwap.toTransactionId,
            existingSwap.toTransactionLink,
            existingSwap.toAddress,
            existingSwap.partner,
            fromAmountFiat,
            toAmountFiat,
            fiatCurrencyCode,
            fiatCurrencyDecimals
        );
    }
}
