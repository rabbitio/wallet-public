import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { Coins } from "../../coins";
import { standardTickerToRabbitTicker } from "./utils/tickersAdapter";

export const coinToUSDRateAtSpecificDateProviders = [
    {
        // https://docs.coincap.io/
        endpoint: "https://api.coincap.io/v2/assets/",
        httpMethod: "get",
        RPS: 3, // 200 per minute without API key
        composeQueryString: params => {
            const coin = params[0];
            const timestamp = params[1];
            let coinIdClearForProvider = null;
            switch (coin.ticker) {
                case Coins.COINS.BTC.ticker:
                    coinIdClearForProvider = "bitcoin";
                    break;
                case Coins.COINS.ETH.ticker:
                    coinIdClearForProvider = "ethereum";
                    break;
                case Coins.COINS.USDTERC20.ticker:
                    coinIdClearForProvider = "tether";
                    break;
                default:
                    throw new Error(
                        "Add support for the coin to coincap coin-usd rate at specific date provider: " + coin.ticker
                    );
            }

            const twoDaysMS = 2 * 24 * 60 * 60 * 1000;
            return `${coinIdClearForProvider}/history?start=${timestamp - twoDaysMS}&end=${timestamp +
                twoDaysMS}&interval=d1`;
        },
        getDataByResponse: (response, params) => {
            let ratesData = response.data.data;
            const timestamp = params[1];

            if (!Array.isArray(ratesData)) throw new Error("Wrong data format for 'coincap' rate at date provider");

            const rateData = ratesData.find(rateData =>
                rateData.date.startsWith(new Date(timestamp).toISOString().slice(0, 10))
            );

            if (!rateData?.priceUsd) throw new Error("Wrong price for 'coincap' for rate at date provider");
            if (!rateData?.date) throw new Error("Wrong date for 'coincap' for rate at date provider");

            return {
                coin: params[0],
                usdRate: +rateData.priceUsd,
                timestamp: rateData.time,
            };
        },
    },
    {
        // https://www.coingecko.com/en/api/documentation
        endpoint: "https://api.coingecko.com/api/v3/coins/",
        httpMethod: "get",
        RPS: 0.5, // 50 per minute without API key
        composeQueryString: params => {
            const coin = params[0];
            let coinIdClearForProvider = null;
            switch (coin.ticker) {
                case Coins.COINS.BTC.ticker:
                    coinIdClearForProvider = "bitcoin";
                    break;
                case Coins.COINS.ETH.ticker:
                    coinIdClearForProvider = "ethereum";
                    break;
                case Coins.COINS.USDTERC20.ticker:
                    coinIdClearForProvider = "tether";
                    break;
                default:
                    throw new Error(
                        "Add support for the coin to coingecko coin-usd rates at date provider:" + coin.ticker
                    );
            }

            const date = new Date(params[1]);
            const year = date.getFullYear();
            const month = date.toISOString().slice(5, 7);
            const day = date.toISOString().slice(8, 10);
            return `/${coinIdClearForProvider}/history?date=${day}-${month}-${year}`;
        },
        getDataByResponse: (response, params) => {
            let coinData = response.data;

            const ticker = coinData.symbol?.toUpperCase();
            const coin = Coins.COINS[standardTickerToRabbitTicker(ticker)];
            if (!coin) throw new Error("Wrong coin symbol for 'coingecko' at rate for date rpovider");
            if (!coinData?.market_data?.current_price?.usd)
                throw new Error("Wrong price for 'coingecko' at rate for date rpovider");

            return {
                coin: coin,
                usdRate: +coinData?.market_data?.current_price?.usd,
                timestamp: params[1],
            };
        },
    },
    {
        // https://messari.io/api/docs#tag/Assets
        endpoint: "https://data.messari.io/api/v1/assets",
        httpMethod: "get",
        RPS: 0.3, // 20 per minute, 1000 per day without API key
        composeQueryString: params => {
            const coin = params[0];
            let coinIdClearForProvider = null;
            switch (coin.ticker) {
                case Coins.COINS.BTC.ticker:
                    coinIdClearForProvider = "bitcoin";
                    break;
                case Coins.COINS.ETH.ticker:
                    coinIdClearForProvider = "ethereum";
                    break;
                case Coins.COINS.USDTERC20.ticker:
                    coinIdClearForProvider = "tether";
                    break;
                default:
                    throw new Error(
                        "Add support for the coin to messari coin-usd rates at date provider" + coin.ticker
                    );
            }

            const date = new Date(params[1]).toISOString().slice(0, 10);

            return `/${coinIdClearForProvider}/metrics/price/time-series?start=${date}&end=${date}&interval=1d`;
        },
        getDataByResponse: (response, params) => {
            let coinData = response.data?.data;

            if (!coinData) throw new Error("Wrong coin data for 'messari' rates at date provider:");
            if (!coinData?.schema?.values_schema)
                throw new Error("Wrong schema defenition for 'messari' rates at date provider");

            const valueIndex = Object.keys(coinData.schema.values_schema).indexOf("close");
            if (valueIndex < 0 || !coinData.values[0][valueIndex])
                throw new Error("Wrong schema for 'messari' rates at date provider");

            return {
                coin: params[0],
                usdRate: +coinData.values[0][valueIndex],
                timestamp: params[1],
            };
        },
    },
];

class CoinToUSDRateAtSpecificDateProvider {
    constructor(providers) {
        this._callerService = new CachedRobustExternalApiCallerService(
            "coinToUsdRateAtSpecificDate",
            providers,
            10000,
            40,
            1000
        );
        this._attemptsCountForDataRetrieval = 10;
    }

    /**
     * Retrieves rate for given coin at specific date
     *
     * @param coin {Coin} coin to get rate for
     * @param timestamp {number} the timestamp of the date you want to get the rate for
     * @return {Promise<number|null>} resolves to the coin-usd rate at the given date or to null if no data found
     */
    async getCoinToUSDRateAtSpecificDate(coin, timestamp) {
        try {
            const result = await this._callerService.callExternalAPICached(
                [coin, timestamp],
                7000,
                null,
                this._attemptsCountForDataRetrieval,
                () => `${coin.ticker}-${timestamp}`
            );

            return result?.usdRate;
        } catch (e) {
            improveAndRethrow(e, "getCoinToUSDRateAtSpecificDate");
        }
    }
}

export const coinToUSDRateAtSpecificDateProvider = new CoinToUSDRateAtSpecificDateProvider(
    coinToUSDRateAtSpecificDateProviders
);
