import { ExistingSwap } from "./existingSwap";

export class ExistingSwapWithFiatData extends ExistingSwap {
    constructor(
        swapId,
        status,
        createdAt,
        expiresAt,
        confirmations,
        rate,
        refundAddress,
        fromCoin,
        fromAmount,
        fromTransactionId,
        toCoin,
        toAmount,
        toTransactionId,
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
            fromCoin,
            fromAmount,
            fromTransactionId,
            toCoin,
            toAmount,
            toTransactionId,
            toAddress,
            partner
        );
        this.fromAmountFiat = fromAmountFiat;
        this.toAmountFiat = toAmountFiat;
        this.fiatCurrencyCode = fiatCurrencyCode;
        this.fiatCurrencyDecimals = fiatCurrencyDecimals;
    }
    static fromExistingSwap(existingSwap, fromAmountFiat, toAmountFiat, fiatCurrencyCode, fiatCurrencyDecimals) {
        return new ExistingSwapWithFiatData(
            existingSwap.swapId,
            existingSwap.status,
            existingSwap.createdAt,
            existingSwap.expiresAt,
            existingSwap.confirmations,
            existingSwap.rate,
            existingSwap.refundAddress,
            existingSwap.fromCoin,
            existingSwap.fromAmount,
            existingSwap.fromTransactionId,
            existingSwap.toCoin,
            existingSwap.toAmount,
            existingSwap.toTransactionId,
            existingSwap.toAddress,
            existingSwap.partner,
            fromAmountFiat,
            toAmountFiat,
            fiatCurrencyCode,
            fiatCurrencyDecimals
        );
    }
}
