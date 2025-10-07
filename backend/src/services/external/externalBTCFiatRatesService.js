import log4js from "log4js";

import RobustExternalAPICallerService from "../../utils/robustExternalAPICallerService.js";
// import { formatUTCDate } from "../../utils/utils.js";

const log = log4js.getLogger("externalBTCFiatRatesService");

const providers = [
    // TODO: [feature, low] Switch to robust rates API if we decide to use this logic. task_id=27565d688d6a80fdb2d5c812131fc87d
    // {
    //     endpoint: "https://api.coingecko.com/api/v3/coins/bitcoin/history",
    //     httpMethod: "get",
    //     composeQueryString: parametersValues => {
    //         const { dd, mm, yyyy } = formatUTCDate(parametersValues[0]);
    //         return `?localization=false&date=${dd}-${mm}-${yyyy}}`;
    //     },
    //     getDataByResponse: response => {
    //         if (response.data && response.data.market_data) {
    //             const rate = +response.data.market_data.current_price.usd;
    //             return +rate.toFixed(2);
    //         }
    //
    //         return null;
    //     },
    // },
    // {
    //     endpoint: "https://api.coindesk.com/v1/bpi/historical/close.json",
    //     httpMethod: "get",
    //     composeQueryString: parametersValues => {
    //         const { dd, mm, yyyy } = formatUTCDate(parametersValues[0]);
    //         return `?start=${yyyy}-${mm}-${dd}&end=${yyyy}-${mm}-${dd}`;
    //     },
    //     getDataByResponse: response => {
    //         if (response.data && response.data.bpi) {
    //             const rateData = response.data.bpi;
    //             const rate = +rateData[Object.keys(rateData)[0]];
    //             return +rate.toFixed(2);
    //         }
    //
    //         return null;
    //     },
    // },
];

export default class ExternalBTCFiatRatesService {
    static externalBtcFiatRateCaller = new RobustExternalAPICallerService(providers);

    static async getRatesForTimestamps(timestamps) {
        try {
            log.info("Start retrieving rates");
            const errors = [];
            const rates = await Promise.all(
                timestamps.map(timestamp => {
                    return this.externalBtcFiatRateCaller.callExternalAPI([timestamp]).catch(e => {
                        errors.push({ e, timestamp });
                    });
                })
            );

            log.info(`Retrieved rates: ${rates}`);
            if (errors.length) {
                log.error(`Errors during rates retrieval: ${JSON.stringify(errors)}`);
            }
            return timestamps.map((timestamp, index) => {
                return {
                    t: timestamp,
                    r: rates[index],
                };
            });
        } catch (e) {
            log.error(e, "getRatesForTimestamps");
        }
    }
}
