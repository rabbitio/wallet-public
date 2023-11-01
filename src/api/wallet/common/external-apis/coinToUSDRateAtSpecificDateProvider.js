import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { ApiGroups } from "../../../common/external-apis/apiGroups";
import { ApiGroupCoinIdAdapters } from "../adapters/apiGroupCoinIdAdapters";
import { PERMANENT_TTL_FOR_RARE_CHANGING_DATA_MS } from "../../../common/utils/ttlConstants";

// TODO: [feature, low] add provider (only some tokens): https://api.blockchain.com/v3/exchange/tickers
// TODO: [feature, low] add provider (only some tokens): https://api.crypto.com/v2/public/get-ticker RPS=100 https://exchange-docs.crypto.com/spot/index.html#rate-limits
// TODO: [feature, low] add provider (only some tokens): BYBIT
// TODO: [feature, low] add provider (only some tokens): BITMART

class CoincapCoinToUsdRateProvider extends ExternalApiProvider {
    constructor() {
        // https://docs.coincap.io/
        super("https://api.coincap.io/v2/assets/", "get", 10000, ApiGroups.COINCAP);
    }
    composeQueryString(params, subRequestIndex = 0) {
        try {
            const coin = params[0];
            const timestamp = params[1];
            const coinIdClearForProvider = ApiGroupCoinIdAdapters.getCoinIdsListByCoinsListForApiGroup(
                ApiGroups.COINCAP,
                [coin]
            )[0];
            const twoDaysMS = 2 * 24 * 60 * 60 * 1000;
            return `${coinIdClearForProvider}/history?start=${timestamp - twoDaysMS}&end=${timestamp +
                twoDaysMS}&interval=d1`;
        } catch (e) {
            improveAndRethrow(e, "CoincapCoinToUsdRateProvider.composeQueryString");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
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
        } catch (e) {
            improveAndRethrow(e, "CoincapCoinToUsdRateProvider.getDataByResponse");
        }
    }
}
class CoingeckoCoinToUsdRateProvider extends ExternalApiProvider {
    constructor() {
        // https://www.coingecko.com/en/api/documentation
        super("https://api.coingecko.com/api/v3/coins/", "get", 10000, ApiGroups.COINGECKO);
    }
    composeQueryString(params, subRequestIndex = 0) {
        try {
            const coin = params[0];
            const coinIdClearForProvider = ApiGroupCoinIdAdapters.getCoinIdsListByCoinsListForApiGroup(
                ApiGroups.COINGECKO,
                [coin]
            )[0];
            const date = new Date(params[1]);
            const year = date.getFullYear();
            const month = date.toISOString().slice(5, 7);
            const day = date.toISOString().slice(8, 10);
            return `/${coinIdClearForProvider}/history?date=${day}-${month}-${year}`;
        } catch (e) {
            improveAndRethrow(e, "CoingeckoCoinToUsdRateProvider.composeQueryString");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            const coin = params[0];
            let coinData = response.data;

            if (!coinData?.market_data?.current_price?.usd)
                throw new Error("Wrong price for 'coingecko' at rate for date rpovider");

            return {
                coin: coin,
                usdRate: +coinData?.market_data?.current_price?.usd,
                timestamp: params[1],
            };
        } catch (e) {
            improveAndRethrow(e, "CoingeckoCoinToUsdRateProvider.getDataByResponse");
        }
    }
}

class MessariCoinToUsdRateProvider extends ExternalApiProvider {
    constructor() {
        // https://messari.io/api/docs#tag/Assets
        super("https://data.messari.io/api/v1/assets", "get", 10000, ApiGroups.MESSARI);
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const coin = params[0];
            const coinIdClearForProvider = ApiGroupCoinIdAdapters.getCoinIdsListByCoinsListForApiGroup(
                ApiGroups.MESSARI,
                [coin]
            )[0];
            const date = new Date(params[1]).toISOString().slice(0, 10);
            const nextDate = new Date(params[1] + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

            return `/${coinIdClearForProvider}/metrics/price/time-series?start=${date}&end=${nextDate}&interval=1d`;
        } catch (e) {
            improveAndRethrow(e, "MessariCoinToUsdRateProvider.composeQueryString");
        }
    }
    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
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
        } catch (e) {
            improveAndRethrow(e, "MessariCoinToUsdRateProvider.getDataByResponse");
        }
    }
}

export const coinToUSDRateAtSpecificDateProviders = [
    new CoincapCoinToUsdRateProvider(),
    new MessariCoinToUsdRateProvider(),
    new CoingeckoCoinToUsdRateProvider(),
];

class CoinToUSDRateAtSpecificDateProvider {
    constructor(providers) {
        this._callerService = new CachedRobustExternalApiCallerService(
            "coinToUsdRateAtSpecificDate",
            providers,
            PERMANENT_TTL_FOR_RARE_CHANGING_DATA_MS, // Because the data is historical rate and should not be actualized
            true,
            null,
            10 // Because this data is not critical - just nice to have, so we can reduce load of providers
        );
        this._attemptsCountForDataRetrieval = 5;
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

export const coinToUSDRateAtSpecificDateProvider = new CoinToUSDRateAtSpecificDateProvider([
    new CoincapCoinToUsdRateProvider(),
    new CoingeckoCoinToUsdRateProvider(),
    new MessariCoinToUsdRateProvider(),
]);
