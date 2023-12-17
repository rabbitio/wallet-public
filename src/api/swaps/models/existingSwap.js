export class ExistingSwap {
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
        partner
    ) {
        this.swapId = swapId;
        this.status = status;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
        this.confirmations = confirmations;
        this.rate = rate;
        this.refundAddress = refundAddress;
        this.fromCoin = fromCoin;
        this.fromTransactionId = fromTransactionId;
        this.fromAmount = fromAmount;
        this.toCoin = toCoin;
        this.toTransactionId = toTransactionId;
        this.toAmount = toAmount;
        this.toAddress = toAddress;
        this.partner = partner;
    }
}
