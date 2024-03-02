export class ExistingSwap {
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
        toAddress, // TODO: [refactoring, moderate] toAddress is not quite clear. How about recipientAddress? task_id=0815a111c99543b78d374217eadbde4f
        partner
    ) {
        this.swapId = swapId;
        this.status = status;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
        this.confirmations = confirmations;
        this.rate = rate;
        this.refundAddress = refundAddress;
        this.payToAddress = payToAddress;
        this.fromCoin = fromCoin;
        this.fromTransactionId = fromTransactionId;
        this.fromAmount = fromAmount;
        this.fromTransactionLink = fromTransactionLink;
        this.toCoin = toCoin;
        this.toTransactionId = toTransactionId;
        this.toTransactionLink = toTransactionLink;
        this.toAmount = toAmount;
        this.toAddress = toAddress;
        this.partner = partner;
    }
}
