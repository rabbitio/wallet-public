import bitcoinJs from "bitcoinjs-lib";

import { mainnet, testnet } from "./networks";

export class FeeRate {
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

    static serializeArray(feeRatesArray) {
        return JSON.stringify(feeRatesArray);
    }

    static deserializeArray(feeRatesArraySerialized) {
        const array = JSON.parse(feeRatesArraySerialized);

        if (!array instanceof Array) throw new Error("Wrong fee rates format in serialized data. ");

        return array.map(feeRateObject => {
            if (!feeRateObject.network || !feeRateObject.blocksCount || !feeRateObject.rate) {
                throw new Error(`Wrong fee rate format in serialized data: ${JSON.stringify(feeRateObject)}. `);
            }

            return new FeeRate(feeRateObject.network, feeRateObject.blocksCount, feeRateObject.rate);
        });
    }
}

export const DEFAULT_RATES = [
    new FeeRate(mainnet.key, 1, 30),
    new FeeRate(mainnet.key, 2, 25),
    new FeeRate(mainnet.key, 5, 6),
    new FeeRate(mainnet.key, 10, 3),
    new FeeRate(mainnet.key, 25, 1),
    new FeeRate(testnet.key, 1, 30),
    new FeeRate(testnet.key, 2, 25),
    new FeeRate(testnet.key, 5, 6),
    new FeeRate(testnet.key, 10, 3),
    new FeeRate(testnet.key, 25, 1),
];

export const MIN_FEE_RATES = [new FeeRate(mainnet.key, null, 1), new FeeRate(testnet.key, null, 1)];

/**
 * Returns virtual size of transaction multiplied with passed rate per byte.
 *
 * @param transaction - tx to calculate fee for
 * @param feeRatePerByte - rate to calculate fee for
 * @returns Number - fee for given tx & rate
 */
export function calculateFeeByFeeRate(transaction, feeRatePerByte) {
    if (!(transaction instanceof bitcoinJs.Transaction)) throw new Error("Invalid transaction type. ");
    if (!(feeRatePerByte instanceof FeeRate)) {
        throw new Error("Invalid fee rate type: " + JSON.stringify(feeRatePerByte));
    }

    // TODO: [bug, critical] Virtual size can be different for different builds of the same transaction
    return transaction.virtualSize() * feeRatePerByte.rate;
}
