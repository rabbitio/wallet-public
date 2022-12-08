import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { Coins } from "../../coins";
import { rabbitTickerToStandardTicker, standardTickerToRabbitTicker } from "./utils/tickersAdapter";
import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";

export const consToUSDRatesProviders = [
    {
        // https://docs.coincap.io/
        // endpoint: "https://api.coincap.io/v2/assets?ids=bitcoin,ethereum,tether",
        endpoint: "https://api.coincap.io/v2/assets",
        httpMethod: "get",
        RPS: 3, // 200 per minute without API key
        composeQueryString: params => {
            const coins = params[0];
            const coinIdsClearForProvider = coins.map(coin => {
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
                        throw new Error("Add support for the coin to coincap coin-usd rates provider: " + coin.ticker);
                }

                return coinIdClearForProvider;
            });

            return `?ids=${coinIdsClearForProvider.join(",")}`;
        },
        getDataByResponse: response => {
            let coinsData = response.data.data;

            if (!Array.isArray(coinsData)) throw new Error("Wrong data format for 'coincap'");

            coinsData = coinsData.map(coinData => {
                const coin = Coins.COINS[standardTickerToRabbitTicker(coinData.symbol)];

                if (!coin) throw new Error("Wrong coin symbol for 'coincap'");
                if (!coinData?.priceUsd) throw new Error("Wrong price for 'coincap'");
                if (!coinData?.changePercent24Hr) throw new Error("Wrong 24h percent for 'coincap'");

                return {
                    coin: coin,
                    usdRate: +coinData.priceUsd,
                    change24hPercent: +coinData.changePercent24Hr,
                };
            });

            return coinsData;
        },
    },
    {
        // https://docs.cex.io/#tickers-for-all-pairs-by-markets
        endpoint: "https://cex.io/api/tickers",
        httpMethod: "get",
        RPS: 1, // 600 per 10 minutes
        composeQueryString: params => {
            return `/${params[0].map(coin => rabbitTickerToStandardTicker(coin.ticker)).join("/")}/USD`;
        },
        getDataByResponse: (response, params) => {
            let coinsData = response.data.data;
            const coins = params[0];

            if (!Array.isArray(coinsData)) throw new Error("Wrong data format for 'cex'");

            for (let i = 0; i < coins.length; ++i) {
                if (
                    !coinsData.find(
                        item => `${rabbitTickerToStandardTicker(coins[i].ticker)}:USD` === item?.pair?.toUpperCase()
                    )
                ) {
                    throw new Error("Missing coin for 'cex': " + coins[i].ticker);
                }
            }

            coinsData = Object.keys(Coins.COINS).map(ticker => {
                const coinData = coinsData.find(
                    item => `${rabbitTickerToStandardTicker(ticker)}:USD` === item?.pair?.toUpperCase()
                );
                if (!coinData?.last) throw new Error("Wrong price for 'cex'");
                if (!coinData?.priceChangePercentage) throw new Error("Wrong 24h percent for 'cex'");

                return {
                    coin: Coins.COINS[ticker],
                    usdRate: +coinData.last,
                    change24hPercent: +coinData.priceChangePercentage,
                };
            });

            return coinsData;
        },
    },
    {
        // https://www.coingecko.com/en/api/documentation
        endpoint: "https://api.coingecko.com/api/v3/coins/markets",
        httpMethod: "get",
        RPS: 0.5, // 50 per minute without API key
        composeQueryString: params => {
            const baseQuery =
                "vs_currency=USD&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h";
            const coins = params[0];
            const coinIdsClearForProvider = coins.map(coin => {
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
                        throw new Error("Add support for the coin to coingecko coin-usd rates provider:" + coin.ticker);
                }

                return coinIdClearForProvider;
            });

            return `?${baseQuery}&ids=${coinIdsClearForProvider.join(",")}`;
        },
        getDataByResponse: response => {
            let coinsData = response.data;

            if (!Array.isArray(coinsData)) throw new Error("Wrong data format for 'coingecko'");

            coinsData = coinsData.map(coinData => {
                const ticker = coinData.symbol?.toUpperCase();
                const coin = Coins.COINS[standardTickerToRabbitTicker(ticker)];
                if (!coin) throw new Error("Wrong coin symbol for 'coingecko'");
                if (!coinData?.current_price) throw new Error("Wrong price for 'coingecko'");
                if (!coinData?.price_change_percentage_24h_in_currency)
                    throw new Error("Wrong 24h percent for 'coingecko'");

                return {
                    coin: coin,
                    usdRate: +coinData.current_price,
                    change24hPercent: +coinData.price_change_percentage_24h_in_currency,
                };
            });

            return coinsData;
        },
    },
    {
        // https://messari.io/api/docs#tag/Assets
        endpoint:
            "https://data.messari.io/api/v1/assets?fields=slug,symbol,metrics/market_data/price_usd,metrics/market_data/percent_change_usd_last_24_hours",
        httpMethod: "get",
        RPS: 0.3, // 20 per minute, 1000 per day without API key
        composeQueryString: () => "",
        getDataByResponse: response => {
            let coinsData = response.data?.data;

            if (!Array.isArray(coinsData)) throw new Error("Wrong data format for 'messari'");

            const rabbitCoins = Object.keys(Coins.COINS);
            const data = [];
            for (let i = 0; i < rabbitCoins.length; ++i) {
                const coinData = coinsData.find(
                    item => item?.symbol.toUpperCase() === rabbitTickerToStandardTicker(rabbitCoins[i])
                );
                if (!coinData) throw new Error("Wrong coin symbol for 'messari' " + rabbitCoins[i]);
                if (!coinData?.metrics?.market_data?.price_usd)
                    throw new Error("Wrong price for 'messari' " + rabbitCoins[i]);
                if (!coinData?.metrics?.market_data?.percent_change_usd_last_24_hours)
                    throw new Error("Wrong 24h percent for 'messari' " + rabbitCoins[i]);

                data.push({
                    coin: Coins.COINS[rabbitCoins[i]],
                    usdRate: +coinData.metrics.market_data.price_usd,
                    change24hPercent: +coinData.metrics.market_data.percent_change_usd_last_24_hours,
                });
            }

            return data;
        },
    },
];

class CoinToUSDRatesProvider {
    constructor(providers) {
        this.bio = "coinToUSDRatesProvider";
        this._callerService = new CachedRobustExternalApiCallerService(this.bio, providers, 10000);
        this._coinsList = Coins.getSupportedCoinsList();
        this._attemptsCountForDataRetrieval = 10;
    }

    /**
     * Retrieves current coins-usd rates for given coins list and 24h change in %.
     * Returns cached data if it is retrieved in last 10 seconds
     *
     * @return {Promise<Array<{
     *     coin: Coin,
     *     usdRate: number,
     *     change24hPercent: number,
     * }>>}
     */
    async getCoinsToUSDRates() {
        try {
            return await this._callerService.callExternalAPICached(
                [this._coinsList],
                7000,
                null,
                this._attemptsCountForDataRetrieval,
                () => ""
            );
        } catch (e) {
            improveAndRethrow(e, `${this.bio}.getCoinsToUSDRates`);
        }
    }
}

export const coinToUSDRatesProvider = new CoinToUSDRatesProvider(consToUSDRatesProviders);
