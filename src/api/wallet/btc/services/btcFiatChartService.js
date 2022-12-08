import { improveAndRethrow, logError } from "../../../common/utils/errorUtils";
import CoinsToFiatRatesService from "../../common/services/coinsToFiatRatesService";
import FiatRatesApi from "../backend-api/fiatRatesApi";
import { Coins } from "../../coins";

export default class BtcFiatChartService {
    static SCALES = {
        DAILY: "daily",
        WEEKLY: "weekly",
        MONTHLY: "monthly",
    };

    static EVENTS = {
        GET_CURRENT_STATE: "current_state",
        ZOOM_IN: "zoom_in",
        ZOOM_OUT: "zoom_out",
        SCROLL_BACK: "back",
        SCROLL_FORWARD: "forward",
        CHANGE_CURRENCY: "change_currency",
    };

    /**
     * Constructs the service instance and initializes data arrays.
     * @param dailyRates - Array of [number, number] - [timestamp, btc-usd rate value]
     * @param usdFiatConversionRate - usd-fiat currency rate to convert rate values to desired currency
     */
    constructor(dailyRates, usdFiatConversionRate) {
        /**
         * Currently selected scale - one of BtcFiatChartService.SCALES strings
         */
        this.scale = BtcFiatChartService.SCALES.DAILY;
        /**
         * Represents number of points (counting from the back of points array) that should be ignored when
         * we slice points. NOTE: this is not an index.
         */
        this.offset = 0;

        /**
         * usd-fiat rate to convert given values
         */
        this.usdFiatConversionRate = usdFiatConversionRate;

        /**
         * Object with arrays of rates for each scale. Values are sorted ascending by rate timestamp.
         * We always show last points of the Array considering current this.offset - number of points to ignore at the
         * end of the array.
         */
        this.rates = {
            [BtcFiatChartService.SCALES.DAILY]: sortAndLocalizeData(dailyRates, usdFiatConversionRate),
            [BtcFiatChartService.SCALES.WEEKLY]: [],
            [BtcFiatChartService.SCALES.MONTHLY]: [],
        };

        const dailyScale = BtcFiatChartService.SCALES.DAILY;
        let currentWeekRates = [];
        let currentMonthRates = [];
        const maxIndex = this.rates[dailyScale].length - 1;
        for (let i = 0; i < this.rates[dailyScale].length; ++i) {
            const date = this.rates[dailyScale][i][0];
            // Considering that week start is at Monday. We ignore that it can be Saturday/Sunday for different countries
            currentWeekRates.push(this.rates[dailyScale][i]);
            if (i === maxIndex || date.getDay() === 0) {
                const newWeekRate = currentWeekRates.reduce((sum, rate) => sum + rate[1], 0) / currentWeekRates.length;
                this.rates[BtcFiatChartService.SCALES.WEEKLY].push([currentWeekRates[0][0], +newWeekRate.toFixed(2)]);
                currentWeekRates = [];
            }

            currentMonthRates.push(this.rates[dailyScale][i]);
            if (i === maxIndex || this.rates[dailyScale][i + 1][0].getDate() === 1) {
                const newMonthRate =
                    currentMonthRates.reduce((sum, rate) => sum + rate[1], 0) / currentMonthRates.length;
                this.rates[BtcFiatChartService.SCALES.MONTHLY].push([
                    currentMonthRates[0][0],
                    +newMonthRate.toFixed(2),
                ]);
                currentMonthRates = [];
            }
        }
    }

    /**
     * Creates an instance of the BtcFiatChartService and initializes it.
     * @return Promise resolving to BtcFiatChartService
     */
    static async getInstance() {
        try {
            let [rates, btcUSDRate, usdFiatConversionRate] = await Promise.all([
                FiatRatesApi.getFiatRatesHistoricalData(),
                CoinsToFiatRatesService.getCoinToUSDRate(Coins.COINS.BTC),
                CoinsToFiatRatesService.getUSDtoCurrentSelectedFiatCurrencyRate(),
            ]);

            rates.push([Date.now(), (+btcUSDRate.rate).toFixed(2)]);

            const instance = new BtcFiatChartService(rates, usdFiatConversionRate);

            // TODO: [feature, critical] clear this interval if the service used per chart UI instantiation (not the only instance for the whole app)
            setInterval(async () => await updateTodayValue(instance), 90000);

            return instance;
        } catch (e) {
            improveAndRethrow(e);
        }
    }

    /**
     * Updates chart data state according to event - changes scale, offset, rate values and
     * returns current scale and points set according to scale, offset and passed points count.
     *
     * @param pointsCount - positive number of points to be returned
     * @param event - one of EVENTS
     * @param eventPayload - optional payload value for given event.
     *                       Should be positive integer number for scroll events.
     *                       Should be positive number for change currency event.
     * @return Returns Object {scale: string, points: [[number, number], ...]}
     */
    getPointsOnEvent(pointsCount, event = BtcFiatChartService.EVENTS.GET_CURRENT_STATE, eventPayload = null) {
        const averageWeeksCountPerMonth = 365 / 12 / 7;
        switch (event) {
            case BtcFiatChartService.EVENTS.GET_CURRENT_STATE:
                break;
            case BtcFiatChartService.EVENTS.ZOOM_OUT:
                if (this.scale === BtcFiatChartService.SCALES.DAILY) {
                    this.scale = BtcFiatChartService.SCALES.WEEKLY;
                    this.offset = Math.floor(this.offset / 7);
                } else if (this.scale === BtcFiatChartService.SCALES.WEEKLY) {
                    this.scale = BtcFiatChartService.SCALES.MONTHLY;
                    this.offset = Math.floor(this.offset / averageWeeksCountPerMonth);
                }
                this._fixPossibleOffsetOverflow(pointsCount);
                break;
            case BtcFiatChartService.EVENTS.ZOOM_IN:
                if (this.scale === BtcFiatChartService.SCALES.MONTHLY) {
                    this.scale = BtcFiatChartService.SCALES.WEEKLY;
                    this.offset = Math.floor(this.offset * averageWeeksCountPerMonth);
                } else if (this.scale === BtcFiatChartService.SCALES.WEEKLY) {
                    this.scale = BtcFiatChartService.SCALES.DAILY;
                    this.offset = Math.floor(this.offset * 7);
                }
                this._fixPossibleOffsetOverflow(pointsCount);
                break;
            case BtcFiatChartService.EVENTS.SCROLL_BACK:
                if (this.offset + eventPayload + pointsCount <= this.rates[this.scale].length) {
                    this.offset = this.offset + eventPayload;
                } else {
                    this.offset = this.rates[this.scale].length - pointsCount;
                }
                break;
            case BtcFiatChartService.EVENTS.SCROLL_FORWARD:
                if (this.offset - eventPayload >= 0) {
                    this.offset = this.offset - eventPayload;
                } else {
                    this.offset = 0;
                }
                break;
            case BtcFiatChartService.EVENTS.CHANGE_CURRENCY:
                const conversionRate = eventPayload / this.usdFiatConversionRate;
                this.usdFiatConversionRate = eventPayload;
                Object.keys(this.rates).forEach(key =>
                    this.rates[key].forEach(rate => (rate[1] = (rate[1] * conversionRate).toFixed(2)))
                );
                break;
            default:
                throw new Error(`Not supported event type: ${event}`);
        }

        return {
            scale: this.scale,
            points: this._slicePointsByCurrentState(pointsCount),
        };
    }

    updateTodayValueAndRecalculateRates(btcFiatRate) {
        const dailyRates = this.rates[BtcFiatChartService.SCALES.DAILY];
        const difference = Math.abs(btcFiatRate - dailyRates[dailyRates.length]) / dailyRates[dailyRates.length];
        if (difference > 0.0099) {
            dailyRates[dailyRates.length][1] = btcFiatRate;
            // TODO: [feature, moderate] recalculate weekly and monthly rates as daily changed
        }
    }

    _fixPossibleOffsetOverflow(pointsCount) {
        if (this.offset + pointsCount > this.rates[this.scale].length) {
            this.offset = this.rates[this.scale].length - pointsCount;
            if (this.offset < 0) {
                this.offset = 0;
            }
        }
    }

    _slicePointsByCurrentState(pointsCount) {
        let firstPointIndex = this.rates[this.scale].length - this.offset - pointsCount;
        if (firstPointIndex < 0) {
            firstPointIndex = 0;
        }

        return this.rates[this.scale].slice(firstPointIndex, firstPointIndex + pointsCount);
    }
}

async function updateTodayValue(instance) {
    try {
        const rate = await CoinsToFiatRatesService.getCoinToCurrentFiatCurrencyRateForSpecificDate(Coins.COINS.BTC);
        rate && instance.updateTodayValueAndRecalculateRates(rate);
    } catch (e) {
        logError(e, null, "Failed to get btc-usd rate for chart data service.");
    }
}

function sortAndLocalizeData(rates, conversionRate) {
    // const timezoneOffsetMS = new Date().getTimezoneOffset() * 60000 * -1;
    rates.forEach(rate => {
        rate[0] = new Date(rate[0] /* + timezoneOffsetMS*/);
        rate[1] = rate[1] * conversionRate;
    });
    rates.sort((r1, r2) => r1[0] - r2[0]);

    return rates;
}
