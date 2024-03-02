import { improveAndRethrow } from "@rabbitio/ui-kit";

import { BtcFeeRatesProvider } from "../external-apis/feerates-external.js";
import { FEE_LIFETIME } from "../../../../properties.js";
import { logError } from "../../../common/utils/errorUtils.js";
import { DEFAULT_RATES } from "../lib/fees.js";
import { Storage } from "../../../common/services/internal/storage.js";
import { postponeExecution } from "../../../common/utils/browserUtils.js";
import { Logger } from "../../../support/services/internal/logs/logger.js";
import { FeeRate } from "../models/feeRate.js";

/**
 * Retrieves the smallest rate by given blocks counts.
 *
 * @param network - network to get rates for
 * @param blocksCounts - {Array<Number>} blocks counts
 * @return {Promise<FeeRate>} the smallest rate
 */
export async function getCurrentSmallestFeeRate(network, blocksCounts = []) {
    try {
        const rates = await Promise.all(
            blocksCounts.map(count => BtcFeeRatesService.getCurrentFeeRate(network, count))
        );

        Logger.log(`All rates: ${rates.map(r => r.toMiniString()).join(";")}`, "getCurrentSmallestFeeRate");

        return rates.reduce((prev, rate) => (prev == null || rate.rate < prev.rate ? rate : prev), null);
    } catch (e) {
        improveAndRethrow(e, "getCurrentSmallestFeeRate");
    }
}

/**
 * Monitor to avoid duplicated retrieval of fee rates
 */
let isRetrievingRates = false;

export class BtcFeeRatesService {
    /**
     * Retrieves current fee rate for given params.
     *
     * Algorithm:
     * 1. Get from cache
     * 2. If data in cache are expired or not present or parsing failed call external service for new rates
     * 3. Return default if ext service returns nothing or call fails
     * 4. Save retrieved data to cache
     * 5. Return rate for given network and blocks count if present in retrieved data or default otherwise
     *
     * @param network - network to get rates for
     * @param blocksCount - count of blocks to confirm transaction in
     * @returns Promise resolving to FeeRate instance
     */
    static async getCurrentFeeRate(network, blocksCount) {
        const loggerSource = "getCurrentFeeRate";
        let rate = DEFAULT_RATES.find(rate => rate.network === network.key && rate.blocksCount === blocksCount);
        try {
            let feesRates = getFeesFromCache();

            if (feesRates === null) {
                if (isRetrievingRates) {
                    return await postponeExecution(async () => {
                        const currentRates = getFeesFromCache();
                        const result = currentRates
                            ? filterRatesForBlocksCount(currentRates, blocksCount, network)
                            : null;

                        return result || (await BtcFeeRatesService.getCurrentFeeRate(network, blocksCount));
                    }, 1000);
                }
                isRetrievingRates = true;
                try {
                    feesRates = await BtcFeeRatesProvider.getFeesFromExtService(network);
                    saveFeeRatesToCache(feesRates, FEE_LIFETIME);
                    Logger.log(
                        `Retrieved and saved to cache ${feesRates
                            .map(item => `${item.blocksCount}:${item.rate}`)
                            .join(",")}`,
                        loggerSource
                    );
                } catch (e) {
                    logError(e, loggerSource, "Failed to get external fee rates");
                } finally {
                    isRetrievingRates = false;
                }
            }

            const currentRate = feesRates?.length && filterRatesForBlocksCount(feesRates, blocksCount, network);
            if (!currentRate) {
                logError(
                    new Error("No fee rates have been got. Default will be returned: " + JSON.stringify(rate)),
                    loggerSource
                );
            } else {
                return currentRate;
            }
        } catch (e) {
            logError(e, loggerSource);
        }

        return rate;
    }
}

function getFeesFromCache() {
    try {
        const serializedFeeRates = Storage.getSerializedFeeRatesArray();
        const expirationTime = Storage.getFeeRatesExpirationTime();
        if (
            !serializedFeeRates ||
            !expirationTime ||
            Number.isNaN(Date.parse(expirationTime)) ||
            +new Date() > +Date.parse(expirationTime)
        ) {
            return null;
        }

        return FeeRate.deserializeArray(serializedFeeRates);
    } catch (e) {
        logError(e, "getFeesFromCache");
        return null;
    }
}

function saveFeeRatesToCache(feeRatesArray, lifetimeMs) {
    Storage.saveFeeRates(FeeRate.serializeArray(feeRatesArray));
    Storage.saveFeeRatesExpirationTime(new Date(new Date().valueOf() + lifetimeMs).toISOString());
}

/**
 * Tries to find fee rate for exact blocks count (if present) or for nearest blocks count.
 * Do not scan more than half of given blocks count back and forward.
 */
function filterRatesForBlocksCount(rates, blocksCount, network) {
    try {
        rates = rates.filter(r => r.network === network.key).sort((r1, r2) => r1.blocksCount - r2.blocksCount);
        let rate = null;
        if (rates[0].blocksCount >= blocksCount) {
            rate = rates[0];
        } else if (rates[rates.length - 1].blocksCount <= blocksCount) {
            rate = rates[rates.length - 1];
        } else {
            for (let i = 0; i < rates.length - 1; ++i) {
                if (rates[i].blocksCount === blocksCount) {
                    rate = rates[i];
                    break;
                } else if (blocksCount > rates[i].blocksCount && blocksCount < rates[i + 1].blocksCount) {
                    rate = new FeeRate(network.key, blocksCount, Math.round((rates[i].rate + rates[i + 1].rate) / 2));
                }
            }
        }

        return rate;
    } catch (e) {
        improveAndRethrow(e, "filterRatesForBlocksCount");
    }
}
