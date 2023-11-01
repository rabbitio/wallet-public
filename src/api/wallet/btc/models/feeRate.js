export class FeeRate {
    /**
     * @param network {string} Network.key
     * @param blocksCount {number}
     * @param rate {number}
     */
    constructor(network, blocksCount, rate) {
        this.network = network;
        this.blocksCount = blocksCount;
        this.rate = rate;
    }

    toString() {
        return JSON.stringify({
            network: this.network,
            blocksCount: this.blocksCount,
            rate: this.rate,
        });
    }

    toMiniString() {
        return `${this.network.slice(0, 4)}:${this.blocksCount}->${this.rate}`;
    }

    static serializeArray(feeRatesArray) {
        return JSON.stringify(feeRatesArray);
    }

    static deserializeArray(feeRatesArraySerialized) {
        const array = JSON.parse(feeRatesArraySerialized);

        if (!(array instanceof Array))
            throw new Error("Wrong fee rates format in serialized data: " + feeRatesArraySerialized);

        return array.map(feeRateObject => {
            if (!feeRateObject.network || !feeRateObject.blocksCount || !feeRateObject.rate) {
                throw new Error(`Wrong fee rate format in serialized data: ${JSON.stringify(feeRateObject)}. `);
            }

            return new FeeRate(feeRateObject.network, feeRateObject.blocksCount, feeRateObject.rate);
        });
    }
}
