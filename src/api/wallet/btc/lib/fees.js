import bitcoinJs from "bitcoinjs-lib";

import { FeeRate } from "../models/feeRate";
import { Coins } from "../../coins";

export const DEFAULT_RATES = [
    new FeeRate(Coins.COINS.BTC.mainnet.key, 1, 30),
    new FeeRate(Coins.COINS.BTC.mainnet.key, 2, 25),
    new FeeRate(Coins.COINS.BTC.mainnet.key, 5, 6),
    new FeeRate(Coins.COINS.BTC.mainnet.key, 10, 3),
    new FeeRate(Coins.COINS.BTC.mainnet.key, 25, 1),
    new FeeRate(Coins.COINS.BTC.testnet.key, 1, 30),
    new FeeRate(Coins.COINS.BTC.testnet.key, 2, 25),
    new FeeRate(Coins.COINS.BTC.testnet.key, 5, 6),
    new FeeRate(Coins.COINS.BTC.testnet.key, 10, 3),
    new FeeRate(Coins.COINS.BTC.testnet.key, 25, 1),
];

export const MIN_FEE_RATES = [
    new FeeRate(Coins.COINS.BTC.mainnet.key, null, 1),
    new FeeRate(Coins.COINS.BTC.testnet.key, null, 1),
];

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
