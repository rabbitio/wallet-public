import log4js from "log4js";

import { improveAndRethrow } from "@rabbitio/ui-kit";

import { getLocalDateByUTCTimestamp, getUTCDateStartByLocalDate } from "../utils/utils.js";
import { dbConnectionHolder } from "../utils/dbConnectionHolder.js";
import { BTC_USD_RATES_DATA } from "./data/btcFiatRates.js";
import { isInsertManyResultValid } from "./mongoUtil.js";
import ExternalBTCFiatRatesService from "./external/externalBTCFiatRatesService.js";
import { NUMBER_OF_DATES_TO_CHECK_RATES_FOR } from "../properties.js";

const log = log4js.getLogger("fiatRatesService");

export default class FiatRatesService {
    static dbCollectionName = "btcUSDRates";

    /**
     * Retrieves all rates from the DB. Also tries to save missing rates.
     *
     * @return Promise resolving to { rates: [[number, number], ...] }
     */
    static async getAllRatesData() {
        log.debug("Start getting rates data.");
        try {
            const ratesDataCollection = await dbConnectionHolder.getCollection(this.dbCollectionName);
            await saveMissingRateValues(ratesDataCollection);

            const rates = (await ratesDataCollection.find().toArray()) || [];

            return { rates: rates.map(rate => [rate.t, rate.r]) };
        } catch (e) {
            improveAndRethrow(e, "getAllRatesData");
        }
    }

    /**
     * Retrieves btc-usd rate for specific date by given timestamp
     *
     * @param timestamp - milliseconds number, UTC
     * @return Promise resolving to null if rate is not found or to { t: number, r: number }
     */
    static async getRateDataForSpecificDate(timestamp) {
        log.debug("Start getting rate for specific date.");
        try {
            const ratesDataCollection = await dbConnectionHolder.getCollection(this.dbCollectionName);

            await saveMissingRateValues(ratesDataCollection);

            const dayStart = getUTCDateStartByLocalDate(getLocalDateByUTCTimestamp(timestamp));
            const dayAfterStart = getUTCDateStartByLocalDate(
                getLocalDateByUTCTimestamp(timestamp + 24 * 60 * 60 * 1000)
            );
            log.debug(`Getting rates between timestamps ${+dayStart}-${+dayAfterStart}`);
            const rates = await ratesDataCollection
                .find({ $and: [{ t: { $gte: dayStart } }, { t: { $lt: dayAfterStart } }] })
                .toArray();
            log.debug(`Found rates are: ${JSON.stringify(rates)}`);

            if (!rates.length) {
                log.debug(`Returning null.`);
                return null;
            }

            const finalRate = +(rates.reduce((prev, current) => prev + current.r, 0) / rates.length).toFixed(2);

            log.debug(`Returning ${finalRate}.`);
            return { t: timestamp, r: finalRate };
        } catch (e) {
            improveAndRethrow(e, "getRateDataForSpecificDate");
        }
    }

    /**
     * Saves historical rates data to db if there is no these records. Checks only one date before today (UTC time).
     *
     * @return Promise resolving to void
     */
    static async saveRatesHistoryDataToDb() {
        log.debug("Start saving static rate history data to DB.");
        try {
            const ratesDataCollection = await dbConnectionHolder.getCollection(this.dbCollectionName);
            const someIndexOfRatesDataToCheckPresence = 419; // Random index just to check that the initialization was performed at least ones
            const oneResultToCheckDataPresence = await ratesDataCollection.findOne({
                t: new Date(BTC_USD_RATES_DATA[someIndexOfRatesDataToCheckPresence][0]),
            });
            if (!oneResultToCheckDataPresence) {
                log.info("Data is not present in the DB, saving it.");
                const insertResult = await ratesDataCollection.insertMany(
                    BTC_USD_RATES_DATA.map(rate => {
                        return {
                            t: new Date(rate[0]),
                            r: rate[1],
                        };
                    })
                );

                if (isInsertManyResultValid(insertResult, BTC_USD_RATES_DATA.length)) {
                    log.info("Data has been saved.");
                } else {
                    log.error(`Failed to save data. Result is: ${JSON.stringify(insertResult)}`);
                }

                await saveMissingRateValues(ratesDataCollection, NUMBER_OF_DATES_TO_CHECK_RATES_FOR);
            } else {
                log.info("Data is present in the DB, skipping saving process.");
            }
        } catch (e) {
            improveAndRethrow(e, "saveRatesHistoryDataToDb");
        }
    }

    static async saveMissing() {
        try {
            log.debug("Start saving missing fiat rates");

            const ratesDataCollection = await dbConnectionHolder.getCollection(this.dbCollectionName);
            await saveMissingRateValues(ratesDataCollection, NUMBER_OF_DATES_TO_CHECK_RATES_FOR);

            log.debug("Missing fiat rates was saved");
        } catch (e) {
            improveAndRethrow(e, "saveMissing");
        }
    }
}

async function saveMissingRateValues(collection, previousDatesCountToCheckRatesPresenceFor = 10) {
    try {
        log.info(`Start saving missing rate records.`);
        const currentDateStartTimestamp = getUTCDateStartByLocalDate(new Date()).getTime();
        log.info(`Current date timestamp: ${currentDateStartTimestamp}`);

        const lastDaysTimestamps = [];
        for (let i = 1; i <= previousDatesCountToCheckRatesPresenceFor; ++i) {
            lastDaysTimestamps.push(new Date(currentDateStartTimestamp - i * 24 * 60 * 60 * 1000));
        }
        const foundRecords = await collection.find({ t: { $in: lastDaysTimestamps } }).toArray();
        log.info(`Checked timestamps: ${lastDaysTimestamps}, found rates are: ${JSON.stringify(foundRecords)}`);

        const notFoundTimestamps = lastDaysTimestamps.reduce(
            (prev, timestamp) =>
                foundRecords.filter(record => Date.parse(record.t) === timestamp.getTime()).length
                    ? prev
                    : [...prev, timestamp],
            []
        );
        log.info(`Not found timestamps are: ${JSON.stringify(notFoundTimestamps)}`);

        const usdRates = await ExternalBTCFiatRatesService.getRatesForTimestamps(notFoundTimestamps);
        log.debug(`Found rates: ${JSON.stringify(usdRates)}`);

        let onlyNotNullRates = usdRates.filter(rate => rate.r != null);
        const timestampsWithNullRates = usdRates.filter(rate => rate.r == null).map(item => item.t);
        if (timestampsWithNullRates.length) {
            log.info(`Retrying for null rates: ${JSON.stringify(timestampsWithNullRates)}`);
            const foundNotNullRates = (
                await ExternalBTCFiatRatesService.getRatesForTimestamps(timestampsWithNullRates)
            ).filter(rate => rate.r != null);
            onlyNotNullRates = [...onlyNotNullRates, ...foundNotNullRates];
        }

        if (onlyNotNullRates.length) {
            log.info(`Inserting following rates: ${JSON.stringify(onlyNotNullRates)}`);
            const insertResult = await collection.insertMany(onlyNotNullRates);

            if (!isInsertManyResultValid(insertResult, onlyNotNullRates.length)) {
                throw new Error(`Insert many failed ${JSON.stringify(insertResult)}.`);
            }
            log.info(`Rates have been successfully inserted. Finish.`);
        } else {
            log.info(`Nothing to be inserted. Finish`);
        }
    } catch (e) {
        log.error("Failed to save missing rate values", e);
    }
}
