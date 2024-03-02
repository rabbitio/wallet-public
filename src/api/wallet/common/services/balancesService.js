import { BigNumber } from "bignumber.js";

import { AmountUtils, improveAndRethrow } from "@rabbitio/ui-kit";

import CoinsToFiatRatesService from "./coinsToFiatRatesService.js";
import { Wallets } from "../wallets.js";
import { cache } from "../../../common/utils/cache.js";
import { CacheAndConcurrentRequestsResolver } from "../../../common/services/utils/robustExteranlApiCallerService/cacheAndConcurrentRequestsResolver.js";
import { SMALL_TTL_FOR_CACHE_L2_MS } from "../../../common/utils/ttlConstants.js";

export class BalancesService {
    // TODO: [tests, moderate] add units for caching for existing tests
    static _allBalancesResolver = new CacheAndConcurrentRequestsResolver(
        "allBalances",
        SMALL_TTL_FOR_CACHE_L2_MS,
        false
    );
    static _balanceCacheKey = wallet => (wallet?.coin?.ticker ?? "") + "_fb868f86-b7a4-4441-aae8_balances";
    static _summaryBalanceResolver = new CacheAndConcurrentRequestsResolver(
        "summaryBalance",
        SMALL_TTL_FOR_CACHE_L2_MS,
        false
    );
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
     * @param [walletsList=null] {Array<Wallet>} list of wallets to get the balances for. All wallets by default
     * @return {Promise<Array<string>>} returns a promise resolving to array of balances in coin denomination
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
     * Retrieves coin balances and their fiat values for all given wallets
     * or for all supported wallets by default
     *
     * @param [walletsList=null] {Wallet[]}
     * @return {Promise<{
     *             coin: Coin,
     *             balanceCoins: string,
     *             balanceFiat: string,
     *             fiatCurrencyCode: string,
     *             fiatCurrencyDecimals: number,
     *             change24hPercent: number,
     *             coinToFiatRate: number,
     *             coinToUsdRate: number,
     *             fiatCurrencySymbol: string,
     *         }[]>}
     */
    static async getBalancesWithFiat(walletsList = null) {
        try {
            walletsList = walletsList ?? Wallets.getWalletsForAllSupportedCoins();
            const balancesCoins = await this._getWalletsBalances(walletsList);
            const balancesForCoins = balancesCoins.map((balance, index) => ({
                coin: walletsList[index].coin,
                amounts: [balance],
            }));
            const fiatBalancesForCoins =
                await CoinsToFiatRatesService.convertCoinsAmountsToCurrentlySelectedFiat(balancesForCoins);

            return fiatBalancesForCoins.map((coinAndFiatBalance, index) => ({
                coin: coinAndFiatBalance.coin,
                balanceCoins: balancesForCoins[index].amounts[0],
                balanceFiat: "" + coinAndFiatBalance.amountsFiat[0], // TODO: [dev] fix fiat conversions to string task_id=1e692bcfabbe487a9d1638fc8ff17448
                fiatCurrencyCode: coinAndFiatBalance.fiatCurrencyCode,
                fiatCurrencyDecimals: coinAndFiatBalance.fiatCurrencyDecimals,
                change24hPercent: coinAndFiatBalance.change24hPercent,
                coinToFiatRate: coinAndFiatBalance.coinToFiatRate,
                coinToUsdRate: coinAndFiatBalance.coinToUsdRate,
                fiatCurrencySymbol: coinAndFiatBalance.fiatCurrencySymbol,
            }));
        } catch (e) {
            improveAndRethrow(e, "getBalancesWithFiat");
        }
    }

    /**
     * Calculates and returns the summary wallet balance for all coins in currently selected fiat currency
     *
     * @return {Promise<{
     *              summaryFiatBalance: string,
     *              portfolioGrowsTodayPerCents: string,
     *              fiatCurrencyCode: string,
     *              fiatCurrencySymbol: string
     *          }>} resolves to summary balance and fiat currency data
     */
    static async getSummaryFiatBalanceForAllCoins() {
        let waitingResult;
        try {
            waitingResult = await this._summaryBalanceResolver.getCachedOrWaitForCachedOrAcquireLock(
                this._summaryBalanceCacheKey
            );
            if (!waitingResult?.canStartDataRetrieval) {
                return waitingResult?.cachedData;
            }

            const wallets = Wallets.getWalletsForAllEnabledCoins();
            const balancesData = await this.getBalancesWithFiat(wallets);

            const sumBalanceInCurrentFiatForTwoDays = wallets.reduce(
                (prev, wallet, index) => {
                    const yesterdayCoinToUSDRate =
                        balancesData[index].coinToUsdRate != null && balancesData[index].change24hPercent != null
                            ? BigNumber(balancesData[index].coinToUsdRate).div(
                                  BigNumber(balancesData[index].change24hPercent).div("100").plus("1")
                              )
                            : null;
                    const usdToCurrentFiatRate =
                        balancesData[index].coinToFiatRate != null && balancesData[index].coinToUsdRate != null
                            ? BigNumber(balancesData[index].coinToFiatRate).div(balancesData[index].coinToUsdRate)
                            : null;
                    return {
                        today: prev.today.plus(
                            balancesData[index].balanceFiat != null
                                ? BigNumber(balancesData[index].balanceFiat)
                                : BigNumber("0")
                        ),
                        yesterday: prev.yesterday.plus(
                            yesterdayCoinToUSDRate != null && usdToCurrentFiatRate != null
                                ? BigNumber(balancesData[index].balanceCoins)
                                      .times(yesterdayCoinToUSDRate)
                                      .times(usdToCurrentFiatRate)
                                : BigNumber("0")
                        ),
                    };
                },
                { today: BigNumber("0"), yesterday: BigNumber("0") }
            );

            let portfolioGrows24hPerCents = BigNumber("0");
            if (!sumBalanceInCurrentFiatForTwoDays.yesterday.isZero()) {
                portfolioGrows24hPerCents = sumBalanceInCurrentFiatForTwoDays.today
                    .minus(sumBalanceInCurrentFiatForTwoDays.yesterday)
                    .times("100")
                    .div(sumBalanceInCurrentFiatForTwoDays.yesterday);
            }

            const fiatData = CoinsToFiatRatesService.getCurrentFiatCurrencyData(); // TODO: [tests, moderate] actualize unit tests
            const result = {
                summaryFiatBalance: AmountUtils.trim(sumBalanceInCurrentFiatForTwoDays.today, fiatData.decimalCount),
                portfolioGrowsTodayPerCents: AmountUtils.trim(portfolioGrows24hPerCents, 2),
                fiatCurrencyCode: fiatData.currency,
                fiatCurrencySymbol: fiatData.symbol.length === 1 ? fiatData.symbol : null,
            };

            this._summaryBalanceResolver.saveCachedData(this._summaryBalanceCacheKey, waitingResult?.lockId, {
                ...result,
            });

            return result;
        } catch (e) {
            improveAndRethrow(e, "getSummaryFiatBalanceForAllCoins");
        } finally {
            this._summaryBalanceResolver.releaseLock(this._summaryBalanceCacheKey, waitingResult?.lockId);
        }
    }

    /**
     * @param walletsList {Wallet[]}
     * @return {Promise<string[]>}
     * @private
     */
    // TODO: [tests, moderate] add units for caching for existing tests
    static async _getWalletsBalances(walletsList) {
        let walletsToRequestBalancesFor;
        try {
            const waitingResults = await Promise.all(
                walletsList.map(wallet =>
                    this._allBalancesResolver.getCachedOrWaitForCachedOrAcquireLock(this._balanceCacheKey(wallet))
                )
            );
            walletsToRequestBalancesFor = walletsList
                .map((wallet, index) =>
                    waitingResults[index]?.canStartDataRetrieval
                        ? { wallet: wallet, lockId: waitingResults[index]?.lockId }
                        : []
                )
                .flat();
            const actualizedBalances = [];
            if (walletsToRequestBalancesFor.length) {
                const promises = walletsToRequestBalancesFor.map(item => item.wallet.calculateBalance());
                const result = await Promise.all(promises);
                walletsToRequestBalancesFor.forEach((item, index) => {
                    const dataItem = { wallet: item.wallet, balance: result[index] };
                    this._allBalancesResolver.saveCachedData(
                        this._balanceCacheKey(item.wallet),
                        item?.lockId,
                        dataItem
                    );
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
            (walletsToRequestBalancesFor ?? []).forEach(item =>
                this._allBalancesResolver.releaseLock(this._balanceCacheKey(item?.wallet), item?.lockId)
            );
        }
    }
}
