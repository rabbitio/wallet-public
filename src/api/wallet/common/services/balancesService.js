import { improveAndRethrow } from "../../../common/utils/errorUtils";
import CoinsToFiatRatesService from "./coinsToFiatRatesService";
import { coinToUSDRatesProvider } from "../external-apis/coinToUSDRatesProvider";
import USDFiatRatesProvider from "../../../fiat/external-apis/usdFiatRatesExternalAPIs";
import { Wallets } from "../wallets";
import { cache } from "../../../common/utils/cache";
import { CacheAndConcurrentRequestsResolver } from "../../../common/services/utils/robustExteranlApiCallerService/cacheAndConcurrentRequestsResolver";

export class BalancesService {
    // TODO: [tests, moderate] add units for caching for existing tests
    static _allBalancesResolver = new CacheAndConcurrentRequestsResolver("allBalances", null, 40, 1000);
    static _allBalancesLastUpdateTimestamps = new Map();
    static _allBalancesTtl = 30000;
    static _balancesCacheKey = wallet => (wallet?.coin?.ticker ?? "") + "_fb868f86-b7a4-4441-aae8-2b3997c17354";
    static _summaryBalanceResolver = new CacheAndConcurrentRequestsResolver("summaryBalance", null, 40, 1000);
    static _summaryBalanceLastUpdateTimestamp = 0;
    static _summaryBalanceTtl = 30000;
    static _summaryBalanceCacheKey = "bdd4d228-e39b-42ea-9a67-3fee90f1a2fb";

    static invalidateCaches(wallets) {
        if (wallets) {
            wallets.map(wallet => cache.invalidate(this._balancesCacheKey(wallet)));
            cache.invalidate(this._summaryBalanceCacheKey);
        } else {
            cache.invalidateContaining(this._balancesCacheKey());
            cache.invalidate(this._summaryBalanceCacheKey);
        }
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
            const expirationTimestamp = this._summaryBalanceLastUpdateTimestamp + this._summaryBalanceTtl;
            if (cached && Date.now() < expirationTimestamp) return cached;

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
            this._summaryBalanceLastUpdateTimestamp = Date.now();

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
            const cached = await Promise.all(
                walletsList.map(wallet =>
                    this._allBalancesResolver.getCachedResultOrWaitForItIfThereIsActiveCalculation(
                        this._balancesCacheKey(wallet)
                    )
                )
            );
            const walletsToRequestBalancesFor = walletsList.filter(
                (wallet, index) =>
                    cached[index] == null ||
                    Date.now() > this._allBalancesLastUpdateTimestamps.get(wallet.coin.ticker) + this._allBalancesTtl
            );
            const actualizedBalances = [];
            if (walletsToRequestBalancesFor.length) {
                const promises = walletsToRequestBalancesFor.map(wallet => wallet.calculateBalance());
                const result = await Promise.all(promises);
                walletsToRequestBalancesFor.forEach((wallet, index) => {
                    const dataItem = { wallet: wallet, balance: result[index] };
                    this._allBalancesResolver.saveCachedData(this._balancesCacheKey(wallet), dataItem);
                    this._allBalancesLastUpdateTimestamps.set(wallet.coin.ticker, Date.now());
                    actualizedBalances.push(dataItem);
                });
            }

            return walletsList.map(wallet => {
                const actualized = actualizedBalances.find(item => item.wallet === wallet);
                if (actualized) return actualized.balance;
                return cached.find(item => item.wallet === wallet)?.balance;
            });
        } catch (e) {
            improveAndRethrow(e, "_getWalletsBalances");
        } finally {
            walletsList.forEach(wallet =>
                this._allBalancesResolver.markActiveCalculationAsFinished(this._balancesCacheKey(wallet))
            );
        }
    }

    /**
     * Actualizes local balance caches with just sent transaction amount and fee. We do this to show the actual
     * balance to user as soon as possible. Later this service will actualize balance from external services, but it
     * can take some time.
     *
     * @param coin {Coin} coin the transaction sends
     * @param txData {TxData} object with sent transaction details
     * @param txId {string} hash of just sent transaction
     */
    static actualizeCachedBalancesAccordingToJustSentTransaction(coin, txData, txId) {
        try {
            const differentCoinFee = coin.doesUseDifferentCoinFee();
            const amountCoins = +coin.atomsToCoinAmount(txData.amount + "");
            const feeCoins = +(differentCoinFee ? coin.feeCoin : coin).atomsToCoinAmount(txData.fee + "");
            const handleCached = (cached, coinAmount1, coinAmount2 = 0) => {
                if (cached && cached.balance) {
                    const reduce = +coinAmount1 + +coinAmount2 > +cached.balance ? 0 : +coinAmount1 + +coinAmount2;
                    cached.balance = +cached.balance - reduce;
                    return { isModified: true, data: cached };
                }
                return { isModified: false, data: cached };
            };
            this._allBalancesResolver.actualizeCachedData(
                this._balancesCacheKey(Wallets.getWalletByCoin(coin)),
                cached => handleCached(cached, amountCoins, differentCoinFee ? 0 : feeCoins)
            );
            this._allBalancesLastUpdateTimestamps.set(coin.ticker, Date.now());
            if (differentCoinFee) {
                this._allBalancesResolver.actualizeCachedData(
                    this._balancesCacheKey(Wallets.getWalletByCoin(coin.feeCoin)),
                    cached => handleCached(cached, feeCoins)
                );
                this._allBalancesLastUpdateTimestamps.set(coin.feeCoin.ticker, Date.now());
            }
            this._summaryBalanceResolver.invalidate(this._summaryBalanceCacheKey);
        } catch (e) {
            improveAndRethrow(e, "actualizeCachedBalancesAccordingToJustSentTransaction");
        }
    }
}
