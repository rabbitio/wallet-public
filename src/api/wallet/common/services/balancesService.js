import { improveAndRethrow } from "../../../common/utils/errorUtils";
import CoinsToFiatRatesService from "./coinsToFiatRatesService";
import USDFiatRatesProvider from "../../../fiat/external-apis/usdFiatRatesExternalAPIs";
import { Wallets } from "../wallets";
import { cache } from "../../../common/utils/cache";
import { CacheAndConcurrentRequestsResolver } from "../../../common/services/utils/robustExteranlApiCallerService/cacheAndConcurrentRequestsResolver";
import { coinToUSDRatesProvider } from "../external-apis/coinToUSDRatesProvider";

export class BalancesService {
    // TODO: [tests, moderate] add units for caching for existing tests
    static _allBalancesResolver = new CacheAndConcurrentRequestsResolver("allBalances", 50000, 60, 1000, false);
    static _balanceCacheKey = wallet => (wallet?.coin?.ticker ?? "") + "_fb868f86-b7a4-4441-aae8_balances";
    static _summaryBalanceResolver = new CacheAndConcurrentRequestsResolver("summaryBalance", 50000, 60, 1000, false);
    static _summaryBalanceCacheKey = "bdd4d228-e39b-42ea-9a67_summary_balance";

    static invalidateCaches(wallets) {
        if (wallets) {
            wallets.map(wallet => cache.invalidate(this._balanceCacheKey(wallet)));
        } else {
            cache.invalidateContaining(this._balanceCacheKey());
        }
        cache.invalidate(this._summaryBalanceCacheKey);
    }

    /**
     * Returns coins balances
     *
     * @param [walletsList=null] {Array<Coin>} list of wallets to get the balances for. All wallets by default
     * @return {Promise<Array<number>>} returns a promise resolving to array of balances
     */
    static async getBalances(walletsList = null) {
        try {
            if (walletsList == null) {
                walletsList = Wallets.getWalletsForAllEnabledCoins();
            }
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
            const waitingResult = await this._summaryBalanceResolver.getCachedResultOrWaitForItIfThereIsActiveCalculation(
                this._summaryBalanceCacheKey
            );
            if (!waitingResult.canStartDataRetrieval) {
                return waitingResult?.cachedData;
            }

            const wallets = Wallets.getWalletsForAllEnabledCoins();
            let currentFiatCurrencyData = CoinsToFiatRatesService.getCurrentFiatCurrencyData();
            let [balances, coinsToFUSDRates, usdToFiatRates] = await Promise.all([
                this._getWalletsBalances(wallets),
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
            const waitingResults = await Promise.all(
                walletsList.map(wallet =>
                    this._allBalancesResolver.getCachedResultOrWaitForItIfThereIsActiveCalculation(
                        this._balanceCacheKey(wallet)
                    )
                )
            );
            const walletsToRequestBalancesFor = walletsList.filter(
                (wallet, index) => waitingResults[index]?.canStartDataRetrieval
            );
            const actualizedBalances = [];
            if (walletsToRequestBalancesFor.length) {
                const promises = walletsToRequestBalancesFor.map(wallet => wallet.calculateBalance());
                const result = await Promise.all(promises);
                walletsToRequestBalancesFor.forEach((wallet, index) => {
                    const dataItem = { wallet: wallet, balance: result[index] };
                    this._allBalancesResolver.saveCachedData(this._balanceCacheKey(wallet), dataItem);
                    actualizedBalances.push(dataItem);
                });
            }

            return walletsList.map(wallet => {
                const actualized = actualizedBalances.find(item => item?.wallet === wallet);
                if (actualized) return actualized.balance;
                const cachedItem = waitingResults.find(item => item?.cachedData?.wallet === wallet);
                return cachedItem?.cachedData?.balance;
            });
        } catch (e) {
            improveAndRethrow(e, "_getWalletsBalances");
        } finally {
            walletsList.forEach(wallet =>
                this._allBalancesResolver.markActiveCalculationAsFinished(this._balanceCacheKey(wallet))
            );
        }
    }
}
