import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { Coins } from "../../coins";
import { BalancesService } from "./balancesService";
import { coinToUSDRatesProvider } from "../external-apis/coinToUSDRatesProvider";
import USDFiatRatesProvider from "../../../fiat/external-apis/usdFiatRatesExternalAPIs";
import CoinsToFiatRatesService from "./coinsToFiatRatesService";
import { Wallets } from "../wallets";
import { NumbersUtils } from "../utils/numbersUtils";
import { CacheAndConcurrentRequestsResolver } from "../../../common/services/utils/robustExteranlApiCallerService/cacheAndConcurrentRequestsResolver";
import {
    BALANCE_CHANGED_EXTERNALLY_EVENT,
    FIAT_CURRENCY_CHANGED_EVENT,
    INCREASE_FEE_IS_FINISHED_EVENT,
    NEW_NOT_LOCAL_TRANSACTIONS_EVENT,
    TRANSACTION_PUSHED_EVENT,
} from "../../../common/adapters/eventbus";

/**
 * Provides API to get the coins list with related data
 * TODO: [tests, moderate] add units for caching for existing tests
 */
export class CoinsListService {
    static _cacheAndRequestsResolver = new CacheAndConcurrentRequestsResolver(
        "coinsListService",
        80000,
        90,
        1000,
        false
    );
    static _cacheKeyUniquePart = "e421726e-b2b4-4238-8632-313152077169";
    static _cacheKey = coins =>
        this._cacheKeyUniquePart + (Array.isArray(coins) ? coins.reduce((p, c) => `${p},${c.ticker}`, "") : "");

    /**
     * Invalidates cache for coins list or all available caches for this service if no coins list provided
     * @param [coins] {Coin[]} array of coins
     */
    static invalidateCaches(coins) {
        if (coins === undefined) {
            this._cacheAndRequestsResolver.invalidateContaining(this._cacheKeyUniquePart);
        } else {
            this._cacheAndRequestsResolver.invalidate(this._cacheKey(coins));
        }
    }

    static eventsListForcingToClearCache = [
        FIAT_CURRENCY_CHANGED_EVENT,
        NEW_NOT_LOCAL_TRANSACTIONS_EVENT,
        BALANCE_CHANGED_EXTERNALLY_EVENT,
        TRANSACTION_PUSHED_EVENT,
        INCREASE_FEE_IS_FINISHED_EVENT,
    ];

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
     *             balanceTrimmedShortened: string,
     *             balanceFiat: string|null,
     *             balanceFiatTrimmed: string|null
     *             }[]>}
     *         Some values can be null if no data is retrieved
     */
    static async getEnabledCoinsSortedByFiatBalance(coins) {
        let cacheId;
        try {
            const allEnabledCoins = Coins.getEnabledCoinsList();
            const requestedEnabledCoins =
                (coins ?? []).length > 0
                    ? coins.filter(c => allEnabledCoins.find(enabledCoin => enabledCoin === c))
                    : allEnabledCoins;
            if (requestedEnabledCoins.length === 0) {
                return [];
            }
            cacheId = this._cacheKey(requestedEnabledCoins);
            // TODO: [tests, critical] Add tests for caching logic
            let result = await this._cacheAndRequestsResolver.getCachedResultOrWaitForItIfThereIsActiveCalculation(
                cacheId
            );
            if (!result.canStartDataRetrieval) {
                return result?.cachedData;
            }

            const wallets = requestedEnabledCoins.map(coin => Wallets.getWalletByCoin(coin));
            let currentFiatData = CoinsToFiatRatesService.getCurrentFiatCurrencyData();
            let [balances, usdToFiatRates, coinsToUSDRates] = await Promise.all([
                BalancesService.getBalances(wallets),
                USDFiatRatesProvider.getUSDFiatRates(),
                coinToUSDRatesProvider.getCoinsToUSDRates(),
            ]);

            if (
                requestedEnabledCoins.find((coin, index) => balances[index] == null) ||
                balances.length !== requestedEnabledCoins.length
            ) {
                throw new Error(
                    `Balance for some coin is null or undefined ${JSON.stringify(
                        wallets.map(w => w.coin.ticker)
                    )} ${JSON.stringify(balances)}`
                );
            }

            let usdToCurrentFiatRate = usdToFiatRates.find(item => item.currency === currentFiatData.currency);
            if (!usdToCurrentFiatRate) {
                currentFiatData = CoinsToFiatRatesService.getDefaultFiatCurrencyData();
                usdToCurrentFiatRate = { rate: 1 };
            }

            const unsortedList = balances.map((balance, index) => {
                const coinToUSDRate = coinsToUSDRates.find(rateData => rateData.coin === requestedEnabledCoins[index]);
                const coinToCurrentFiatRate = coinToUSDRate ? coinToUSDRate.usdRate * usdToCurrentFiatRate.rate : null;

                const isBalanceZero = balance === 0 || /^[0.,]+$/.test(balance);
                let balanceNotTrimmed =
                    typeof balance === "number" ? balance.toFixed(requestedEnabledCoins[index].digits) : balance;
                // TODO: [tests, critical] actualize unit tests according to trimming logic applied below
                balanceNotTrimmed = isBalanceZero
                    ? Number(0).toFixed(requestedEnabledCoins[index].digits)
                    : NumbersUtils.removeRedundantRightZerosFromNumberString(balanceNotTrimmed);
                const balanceTrimmed = NumbersUtils.trimCurrencyAmount(
                    balanceNotTrimmed,
                    requestedEnabledCoins[index].digits,
                    13
                );
                const balanceTrimmedShortened = NumbersUtils.trimCurrencyAmount(
                    balanceNotTrimmed,
                    requestedEnabledCoins[index].digits,
                    10
                );
                const balanceFiat =
                    coinToCurrentFiatRate != null
                        ? (+balance * coinToCurrentFiatRate).toFixed(currentFiatData.decimalCount)
                        : null;
                const balanceFiatTrimmed =
                    balanceFiat != null
                        ? NumbersUtils.trimCurrencyAmount(balanceFiat, currentFiatData.decimalCount, 10)
                        : null;
                return {
                    ticker: requestedEnabledCoins[index].ticker,
                    tickerPrintable: requestedEnabledCoins[index].tickerPrintable,
                    latinName: requestedEnabledCoins[index].latinName,
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
                    balanceTrimmedShortened: balanceTrimmedShortened,
                    balanceFiat: balanceFiat,
                    balanceFiatTrimmed: balanceFiatTrimmed,
                };
            });

            const sorted = unsortedList.sort((coin1, coin2) => +coin2.balanceFiat - +coin1.balanceFiat);

            if (sorted.length === allEnabledCoins.length) {
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
