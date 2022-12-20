import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { Coins } from "../../coins";
import { BalancesService } from "./balancesService";
import { coinToUSDRatesProvider } from "../external-apis/coinToUSDRatesProvider";
import USDFiatRatesProvider from "../../../fiat/external-apis/usdFiatRatesExternalAPIs";
import CoinsToFiatRatesService from "./coinsToFiatRatesService";
import { Wallets } from "../wallets";
import { NumbersUtils } from "../utils/numbersUtils";
import { CacheAndConcurrentRequestsResolver } from "../../../common/services/utils/robustExteranlApiCallerService/cacheAndConcurrentRequestsResolver";

/**
 * Provides API to get the coins list with related data
 * TODO: [tests, moderate] add units for caching for existing tests
 */
export class CoinsListService {
    static _cacheAndRequestsResolver = new CacheAndConcurrentRequestsResolver("coinsListService", 18000, 90, 1000);
    static _cacheKey = coins =>
        "e421726e-b2b4-4238-8632-313152077169" +
        (Array.isArray(coins) ? coins.reduce((p, c) => `${p},${c.ticker}`, "") : "");

    /**
     * Invalidates cache for coins list or all available caches for this service if no coins list provided
     * @param [coins] {Coin[]} array of coins
     */
    static invalidateCaches(coins) {
        this._cacheAndRequestsResolver.invalidate(this._cacheKey(coins));
    }

    /**
     * Retrieves coins list and calculates balance, rate, fiat equivalents for each coin.
     * Final list is sorted by fiat balance equivalent descending.
     * NOTE: returned balance values are not exact (just floating point number even for coins having many digits after the comma)
     *
     * @param [coins] {Array<Coin>} list of coins to get the data for. All supported coins by default
     * @return {Promise<{
     *             ticker: string,
     *             tickerPrintable: string,
     *             latinName: string,
     *             fiatCurrencyCode: string,
     *             coinToFiatRate: string|null,
     *             coinFiatRateChange24hPercent: number|null,
     *             balance: string,
     *             balanceTrimmed: string,
     *             balanceFiat: string|null
     *             }[]>}
     *         Some values can be null if no data is retrieved
     */
    static async getOrderedCoinsDataWithFiat(coins) {
        const cacheId = this._cacheKey(coins);
        try {
            // TODO: [tests, critical] Add tests for caching logic
            let cached = await this._cacheAndRequestsResolver.getCachedResultOrWaitForItIfThereIsActiveCalculation(
                cacheId
            );
            const allSupportedCoins = Coins.getSupportedCoinsList();
            if (!coins) {
                coins = allSupportedCoins;
            } else if (cached) {
                cached = cached.filter(item => coins.find(c => c.ticker === item.ticker));
                if ((cached?.length ?? 0) !== coins.length) {
                    cached = null;
                }
            }
            if (cached) return cached;

            const wallets = Wallets.getWalletsForAllSupportedCoins().filter(wallet =>
                coins.find(coin => coin === wallet.coin)
            );
            let [balances, usdToFiatRates, coinsToUSDRates, currentFiatData] = await Promise.all([
                BalancesService.getBalances(wallets),
                USDFiatRatesProvider.getUSDFiatRates(),
                coinToUSDRatesProvider.getCoinsToUSDRates(),
                CoinsToFiatRatesService.getCurrentFiatCurrencyData(),
            ]);

            if (coins.find((coin, index) => balances[index] == null) || balances.length !== coins.length) {
                throw new Error(`Balance for some coin is null or undefined ${JSON.stringify(balances)}`);
            }

            let usdToCurrentFiatRate = usdToFiatRates.find(item => item.currency === currentFiatData.currency);
            if (!usdToCurrentFiatRate) {
                currentFiatData = CoinsToFiatRatesService.getDefaultFiatCurrencyData();
                usdToCurrentFiatRate = 1;
            }

            const unsortedList = balances.map((balance, index) => {
                const coinToUSDRate = coinsToUSDRates.find(rateData => rateData.coin === coins[index]);
                const coinToCurrentFiatRate = coinToUSDRate ? coinToUSDRate.usdRate * usdToCurrentFiatRate.rate : null;

                const isBalanceZero = balance === 0 || /^[0.,]+$/.test(balance);
                let balanceNotTrimmed = typeof balance === "number" ? balance.toFixed(coins[index].digits) : balance;
                balanceNotTrimmed = isBalanceZero
                    ? Number(0).toFixed(coins[index].digits)
                    : NumbersUtils.removeRedundantRightZerosFromNumberString(balanceNotTrimmed);
                const balanceTrimmed = NumbersUtils.trimCoinAmounts([[balanceNotTrimmed, coins[index]]])[0];

                return {
                    ticker: coins[index].ticker,
                    tickerPrintable: coins[index].tickerPrintable,
                    latinName: coins[index].latinName,
                    fiatCurrencyCode: currentFiatData.currency,
                    coinToFiatRate: coinToCurrentFiatRate
                        ? coinToCurrentFiatRate.toFixed(currentFiatData.decimalCount)
                        : null,
                    coinFiatRateChange24hPercent: coinToUSDRate
                        ? isBalanceZero
                            ? 0
                            : +coinToUSDRate.change24hPercent
                        : null,
                    balance: balanceNotTrimmed,
                    balanceTrimmed: balanceTrimmed,
                    balanceFiat: coinToCurrentFiatRate
                        ? (+balance * coinToCurrentFiatRate).toFixed(currentFiatData.decimalCount)
                        : null,
                };
            });

            const sorted = unsortedList.sort((coin1, coin2) => +coin2.balanceFiat - +coin1.balanceFiat);

            if (sorted.length === allSupportedCoins.length) {
                this._cacheAndRequestsResolver.saveCachedData(cacheId, sorted);
            }

            return sorted;
        } catch (e) {
            improveAndRethrow(e, "getOrderedCoinsDataWithFiat");
        } finally {
            this._cacheAndRequestsResolver.markActiveCalculationAsFinished(cacheId);
        }
    }
}
