import { improveAndRethrow } from "../../../common/utils/errorUtils";
import CoinsToFiatRatesService from "./coinsToFiatRatesService";
import { coinToUSDRatesProvider } from "../external-apis/coinToUSDRatesProvider";
import USDFiatRatesProvider from "../../../fiat/external-apis/usdFiatRatesExternalAPIs";
import { Wallets } from "../wallets";
import { cache } from "../../../common/utils/cache";
import { CacheAndConcurrentRequestsResolver } from "../../../common/services/utils/robustExteranlApiCallerService/cacheAndConcurrentRequestsResolver";

export class BalancesService {
    // TODO: [tests, moderate] add units for caching for existing tests
    static _allBalancesResolver = new CacheAndConcurrentRequestsResolver("allBalances", 30000, 40, 1000);
    static _summaryBalanceResolver = new CacheAndConcurrentRequestsResolver("summaryBalance", 30000, 40, 1000);
    static _balancesCacheKey = "fb868f86-b7a4-4441-aae8-2b3997c17354";
    static _summaryBalanceCacheKey = "bdd4d228-e39b-42ea-9a67-3fee90f1a2fb";

    static invalidateCaches() {
        cache.invalidate(this._balancesCacheKey);
        cache.invalidate(this._summaryBalanceCacheKey);
    }

    /**
     * Returns coins balances
     *
     * @param walletsList - {Array<Coin>} list of wallets to get the balances for. All wallets by default
     * @return {Promise<Array<number>>} returns a promise resolving to array of balances
     */
    static async getBalances(walletsList = Wallets.getWalletsForAllSupportedCoins()) {
        try {
            return await this._getWalletsBalances(walletsList);
        } catch (e) {
            improveAndRethrow(e, "getBalances");
        }
    }

    /**
     * Calculates and returns the summary wallet balance for all coins in currently selected fiat currency
     *  TODO: [tests, moderate] add units for caching for existing tests
     *
     * @return {Promise<{
     *              summaryFiatBalance: string,
     *              portfolioGrowsTodayPerCents: string,
     *              fiatCurrencyCode: string,
     *              fiatCurrencySymbol: string
     *          }>} resolves to summary balance and fiat currency data
     */
    static async getSummaryFiatBalanceForAllCoins() {
        try {
            const cached = await this._summaryBalanceResolver.getCachedResultOrWaitForItIfThereIsActiveCalculation(
                this._summaryBalanceCacheKey
            );
            if (cached) return cached;

            const wallets = Wallets.getWalletsForAllSupportedCoins();
            let [balances, currentFiatCurrencyData, coinsToFUSDRates, usdToFiatRates] = await Promise.all([
                this._getWalletsBalances(wallets),
                CoinsToFiatRatesService.getCurrentFiatCurrencyData(),
                coinToUSDRatesProvider.getCoinsToUSDRates(),
                USDFiatRatesProvider.getUSDFiatRates(),
            ]);

            let usdToCurrentFiatRate = usdToFiatRates.find(item => item.currency === currentFiatCurrencyData.currency);
            if (!usdToCurrentFiatRate) {
                currentFiatCurrencyData = CoinsToFiatRatesService.getDefaultFiatCurrencyData();
                usdToCurrentFiatRate = { rate: 1 };
            }

            const sumBalanceInCurrentFiatForTwoDays = wallets.reduce(
                (prev, wallet, index) => {
                    const coinToUSDRate = coinsToFUSDRates.find(item => item.coin === wallet.coin);
                    const coinBalance = +balances[index];
                    const yesterdayCoinToUSDRate = coinToUSDRate.usdRate / (1 + coinToUSDRate.change24hPercent / 100);
                    return {
                        today: prev.today + coinBalance * coinToUSDRate.usdRate * usdToCurrentFiatRate.rate,
                        yesterday: prev.yesterday + coinBalance * yesterdayCoinToUSDRate * usdToCurrentFiatRate.rate,
                    };
                },
                { today: 0, yesterday: 0 }
            );

            let portfolioGrows24hPerCents = 0;
            if (sumBalanceInCurrentFiatForTwoDays.yesterday !== 0) {
                portfolioGrows24hPerCents =
                    ((sumBalanceInCurrentFiatForTwoDays.today - sumBalanceInCurrentFiatForTwoDays.yesterday) * 100) /
                    sumBalanceInCurrentFiatForTwoDays.yesterday;
            }

            const result = {
                summaryFiatBalance: sumBalanceInCurrentFiatForTwoDays.today.toFixed(
                    currentFiatCurrencyData.decimalCount
                ),
                portfolioGrowsTodayPerCents: portfolioGrows24hPerCents.toFixed(2),
                fiatCurrencyCode: currentFiatCurrencyData.currency,
                fiatCurrencySymbol: currentFiatCurrencyData.symbol.length === 1 ? currentFiatCurrencyData.symbol : null,
            };

            this._summaryBalanceResolver.saveCachedData(this._summaryBalanceCacheKey, { ...result });

            return result;
        } catch (e) {
            improveAndRethrow(e, "getSummaryFiatBalanceForAllCoins");
        } finally {
            this._summaryBalanceResolver.markActiveCalculationAsFinished(this._summaryBalanceCacheKey);
        }
    }

    // TODO: [tests, moderate] add units for caching for existing tests
    static async _getWalletsBalances(walletsList) {
        try {
            const cached = await this._allBalancesResolver.getCachedResultOrWaitForItIfThereIsActiveCalculation(
                this._balancesCacheKey
            );
            const cachedBalances = [];
            const walletsAbsentInCache = walletsList.reduce((prev, wallet) => {
                const walletIndexInCache = (cached?.walletsList ?? []).indexOf(wallet);
                if (walletIndexInCache > -1) {
                    cachedBalances.push(cached?.balances[walletIndexInCache]);
                    return prev;
                }

                return [...prev, wallet];
            }, []);

            if (!cached || walletsAbsentInCache.length) {
                const promises = walletsList.map(wallet => wallet.calculateBalance());
                const result = await Promise.all(promises);
                this._allBalancesResolver.saveCachedData(this._balancesCacheKey, {
                    walletsList: walletsList,
                    balances: result,
                });

                return result;
            }

            return cachedBalances;
        } catch (e) {
            improveAndRethrow(e, "_getWalletsBalances");
        } finally {
            this._allBalancesResolver.markActiveCalculationAsFinished(this._balancesCacheKey);
        }
    }
}
