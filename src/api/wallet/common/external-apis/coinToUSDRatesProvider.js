import { improveAndRethrow } from "@rabbitio/ui-kit";

import { logError } from "../../../common/utils/errorUtils.js";
import { Coins } from "../../coins.js";
import { TickersAdapter } from "./utils/tickersAdapter.js";
import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService.js";
import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider.js";
import { ApiGroups } from "../../../common/external-apis/apiGroups.js";
import { ApiGroupCoinIdAdapters, areCoinsSupportedByCex } from "../adapters/apiGroupCoinIdAdapters.js";
import { cache } from "../../../common/utils/cache.js";
import { LONG_TTL_FOR_FREQ_CHANGING_DATA_MS } from "../../../common/utils/ttlConstants.js";

// TODO: [feature, low] add provider (only some tokens): https://api.blockchain.com/v3/exchange/tickers
// TODO: [feature, low] add provider (only some tokens): https://api.crypto.com/v2/public/get-ticker RPS=100 https://exchange-docs.crypto.com/spot/index.html#rate-limits
// TODO: [feature, low] add provider (only some tokens): BYBIT
// TODO: [feature, low] add provider (only some tokens): BITMART

const persistentCacheIdForWholeCoinsListRates = "4dae01dc-d6a9-4931-9646-55eb59f9f96e";

class CoincapCoinsToUsdRatesProvider extends ExternalApiProvider {
    constructor() {
        // https://docs.coincap.io/
        // endpoint: "https://api.coincap.io/v2/assets?ids=bitcoin,ethereum,tether",
        super("https://api.coincap.io/v2/assets", "get", 15000, ApiGroups.COINCAP);
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const enabledCoins = params[0];
            const coinIdsClearForProvider = ApiGroupCoinIdAdapters.getCoinIdsListByCoinsListForApiGroup(
                ApiGroups.COINCAP,
                enabledCoins
            );
            return `?ids=${coinIdsClearForProvider.join(",")}`;
        } catch (e) {
            improveAndRethrow(e, "CoincapCoinsToUsdRatesProvider.composeQueryString");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            let coinsData = response?.data?.data;

            if (!Array.isArray(coinsData)) throw new Error("Wrong data format for 'coincap'");

            return params[0].map(coin => {
                const data = coinsData.find(
                    item => TickersAdapter.rabbitTickerToStandardTicker(coin.ticker, coin.protocol) === item.symbol
                );
                if (!data) throw new Error(`No rate found for ${coin.ticker}`);
                if (!data?.priceUsd) throw new Error("Wrong price for 'coincap'");
                if (!data?.changePercent24Hr) throw new Error("Wrong 24h percent for 'coincap'");

                return {
                    coin: coin,
                    usdRate: +data.priceUsd,
                    change24hPercent: +data.changePercent24Hr,
                };
            });
        } catch (e) {
            improveAndRethrow(e, "CoincapCoinsToUsdRatesProvider.getDataByResponse");
        }
    }
}

class CexCoinsToUsdRatesProvider extends ExternalApiProvider {
    constructor() {
        // https://docs.cex.io/#tickers-for-all-pairs-by-markets
        super("https://cex.io/api/tickers/USD", "get", 15000, ApiGroups.CEX);
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const coins = params[0];
            const supported = areCoinsSupportedByCex(coins);
            if (!supported) {
                throw new Error("CEX doesn't support exactly:" + JSON.stringify(coins.map(c => c.ticker)));
            }
            return "";
        } catch (e) {
            improveAndRethrow(e, "CexCoinsToUsdRatesProvider.composeQueryString");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            let coinsData = response?.data?.data;
            const enabledCoins = params[0];

            if (!Array.isArray(coinsData)) throw new Error("Wrong data format for 'cex'");

            for (let i = 0; i < enabledCoins.length; ++i) {
                if (
                    !coinsData.find(
                        item =>
                            `${TickersAdapter.rabbitTickerToStandardTicker(enabledCoins[i].ticker, enabledCoins[i].protocol)}:USD` ===
                            (item?.pair ?? "").toUpperCase()
                    )
                ) {
                    throw new Error("Missing coin for 'cex': " + enabledCoins[i].ticker);
                }
            }

            coinsData = enabledCoins.map(coin => {
                const coinData = coinsData.find(
                    item =>
                        `${TickersAdapter.rabbitTickerToStandardTicker(coin.ticker, coin.protocol)}:USD` ===
                        (item?.pair ?? "").toUpperCase()
                );
                if (!coinData?.last) throw new Error("Wrong price for 'cex'");
                if (!coinData?.priceChangePercentage) throw new Error("Wrong 24h percent for 'cex'");

                return {
                    coin: coin,
                    usdRate: +coinData.last,
                    change24hPercent: +coinData.priceChangePercentage,
                };
            });

            return coinsData;
        } catch (e) {
            improveAndRethrow(e, "CexCoinsToUsdRatesProvider.getDataByResponse");
        }
    }
}

class CoingeckoCoinsToUsdRatesProvider extends ExternalApiProvider {
    constructor() {
        /**
         * Coingecko is strict in terms of abusing API and blocks by IP for >=1 minutes if you abuse it.
         */
        // https://www.coingecko.com/en/api/documentation
        super("https://api.coingecko.com/api/v3/coins/markets", "get", 15000, ApiGroups.COINGECKO, {}, 250);
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const baseQuery = `vs_currency=USD&order=market_cap_desc&per_page=${this.maxPageLength}&page=1&sparkline=false&price_change_percentage=24h`;
            // We use all supported coins because coingecko supports all our coins currently
            const allSupportedCoins = params[1];
            const coinIdsClearForProvider = ApiGroupCoinIdAdapters.getCoinIdsListByCoinsListForApiGroup(
                ApiGroups.COINGECKO,
                allSupportedCoins
            );
            return `?${baseQuery}&ids=${coinIdsClearForProvider.join(",")}`;
        } catch (e) {
            improveAndRethrow(e, "CoingeckoCoinsToUsdRatesProvider.composeQueryString");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            let coinsData = response?.data;
            const allSupportedCoins = params[1];

            if (!Array.isArray(coinsData)) throw new Error("Wrong data format for 'coingecko'");

            const result = allSupportedCoins.map(coin => {
                const data = coinsData.find(
                    item =>
                        TickersAdapter.rabbitTickerToStandardTicker(coin.ticker, coin.protocol) ===
                        (item?.symbol ?? "").toUpperCase()
                );
                if (!data) throw new Error(`No rate found for ${coin.ticker} in coingecko`);
                if (!data?.current_price) throw new Error("Wrong price for 'coingecko'");
                if (!data?.price_change_percentage_24h_in_currency)
                    throw new Error("Wrong 24h percent for 'coingecko'");

                return {
                    coin: coin,
                    usdRate: +data.current_price,
                    change24hPercent: +data.price_change_percentage_24h_in_currency,
                };
            });

            saveAllSupportedCoinsRatesToPersistentCache(result);
            return result;
        } catch (e) {
            improveAndRethrow(e, "CoingeckoCoinsToUsdRatesProvider.getDataByResponse");
        }
    }
}

class MessariCoinsToUsdRatesProvider extends ExternalApiProvider {
    constructor() {
        // NOTE: this provider returns only restricted set of assets so should be used with the lowest priority
        // https://messari.io/api/docs#tag/Assets
        super(
            "https://data.messari.io/api/v2/assets?fields=slug,symbol,metrics/market_data/price_usd,metrics/market_data/percent_change_usd_last_24_hours",
            "get",
            15000,
            ApiGroups.MESSARI
        );
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            // Adapter will fail if there are not supported coins in the list
            ApiGroupCoinIdAdapters.getCoinIdsListByCoinsListForApiGroup(ApiGroups.MESSARI, params[0]);
            return "";
        } catch (e) {
            improveAndRethrow(e, "MessariCoinsToUsdRatesProvider.composeQueryString");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            let coinsData = response.data?.data;

            if (!Array.isArray(coinsData)) throw new Error("Wrong data format for 'messari'");

            const enabledCoins = params[0];
            const data = [];
            for (let i = 0; i < enabledCoins.length; ++i) {
                const coinData = coinsData.find(
                    item =>
                        (item?.symbol ?? "").toUpperCase() ===
                        TickersAdapter.rabbitTickerToStandardTicker(enabledCoins[i].ticker, enabledCoins[i].protocol)
                );
                if (!coinData) throw new Error("Wrong coin symbol for 'messari' " + enabledCoins[i].ticker);
                if (!coinData?.metrics?.market_data?.price_usd)
                    throw new Error("Wrong price for 'messari' " + enabledCoins[i].ticker);
                if (!coinData?.metrics?.market_data?.percent_change_usd_last_24_hours)
                    throw new Error("Wrong 24h percent for 'messari' " + enabledCoins[i].ticker);

                data.push({
                    coin: enabledCoins[i],
                    usdRate: +coinData.metrics.market_data.price_usd,
                    change24hPercent: +coinData.metrics.market_data.percent_change_usd_last_24_hours,
                });
            }

            return data;
        } catch (e) {
            improveAndRethrow(e, "MessariCoinsToUsdRatesProvider.getDataByResponse");
        }
    }
}

export const consToUSDRatesProviders = [
    new CoingeckoCoinsToUsdRatesProvider(),
    new CoincapCoinsToUsdRatesProvider(),
    new CexCoinsToUsdRatesProvider(),
    new MessariCoinsToUsdRatesProvider(),
];

class CoinToUSDRatesProvider {
    constructor(providers) {
        this.bio = "coinToUSDRatesProvider";
        this._ttlMs = LONG_TTL_FOR_FREQ_CHANGING_DATA_MS;
        this._callerService = new CachedRobustExternalApiCallerService(this.bio, providers, this._ttlMs, false);
        this._attemptsCountForDataRetrieval = 1;
    }

    /**
     * Retrieves current coins-usd rates for all supported coins and 24h change in %.
     * For some providers uses retrieves only for enabled list as these providers support small number of tokens.
     *
     * @param [allowRequestingOnlyForEnabled=true] {boolean} by default we can request rates only for enabled coins. If you need to request for all supported coins pass true for this param
     * @return {Promise<Array<{
     *     coin: Coin,
     *     usdRate: number,
     *     change24hPercent: number,
     * }>>}
     */
    async getCoinsToUSDRates(allowRequestingOnlyForEnabled = true) {
        let persistentCacheForAllSupported = getAllSupportedCoinsRatesFromPersistentCache();
        try {
            if (
                typeof persistentCacheForAllSupported?.timestamp === "number" &&
                persistentCacheForAllSupported.timestamp + this._ttlMs >= Date.now() &&
                Array.isArray(persistentCacheForAllSupported?.data)
            ) {
                return persistentCacheForAllSupported.data;
            }
            const enabledCoins = Coins.getEnabledCoinsList();
            const supportedCoins = Coins.getSupportedCoinsList();
            return await this._callerService.callExternalAPICached(
                [allowRequestingOnlyForEnabled ? enabledCoins : supportedCoins, supportedCoins],
                25000,
                null,
                this._attemptsCountForDataRetrieval,
                params => hashFunctionForCacheIdForCoinsList(params[0])
            );
        } catch (e) {
            if (persistentCacheForAllSupported?.data != null) {
                logError(e, "getCoinsToUSDRates");
                return persistentCacheForAllSupported.data;
            } else {
                improveAndRethrow(e, `${this.bio}.getCoinsToUSDRates`);
            }
        }
    }
}

const hashFunctionForCacheIdForCoinsList = coins =>
    coins.map(coin => TickersAdapter.rabbitTickerToStandardTicker(coin.ticker, coin.protocol)).join(",") +
    "_ccfe9f34-e3db-4e8f-b7c4-9128f3578188";

function saveAllSupportedCoinsRatesToPersistentCache(result) {
    try {
        const persistentCacheItem = JSON.stringify({
            data: result.map(item => ({
                ticker: item.coin.ticker,
                usdRate: item.usdRate,
                change24hPercent: item.change24hPercent,
            })),
            timestamp: Date.now(),
        });
        cache.putClientPersistentData(persistentCacheIdForWholeCoinsListRates, persistentCacheItem);
    } catch (e) {
        improveAndRethrow(e, "saveAllSupportedCoinsRatesToPersistentCache");
    }
}

function getAllSupportedCoinsRatesFromPersistentCache() {
    try {
        const cachedSerialized = cache.getClientPersistentData(persistentCacheIdForWholeCoinsListRates);
        if (!cachedSerialized) {
            return null;
        }
        const cached = JSON.parse(cachedSerialized);
        return {
            timestamp: cached.timestamp,
            data: cached.data.map(item => ({
                coin: Coins.getCoinByTicker(item.ticker),
                usdRate: item.usdRate,
                change24hPercent: item.change24hPercent,
            })),
        };
    } catch (e) {
        improveAndRethrow(e, "saveAllSupportedCoinsRatesToPersistentCache");
    }
}

export const coinToUSDRatesProvider = new CoinToUSDRatesProvider(consToUSDRatesProviders);
