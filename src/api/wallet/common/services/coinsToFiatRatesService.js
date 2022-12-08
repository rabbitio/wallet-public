import { COINS_TO_FIAT_RATES_LIFETIME, USD_FIAT_RATES_LIFETIME } from "../../../../properties";
import { getWalletId } from "../../../common/services/internal/storage";
import { improveAndRethrow, logError } from "../../../common/utils/errorUtils";
import FiatCurrenciesService from "../../../fiat/services/internal/fiatCurrenciesService";
import USDFiatRatesProvider from "../../../fiat/external-apis/usdFiatRatesExternalAPIs";
import { Logger } from "../../../support/services/internal/logs/logger";
import { WalletDataApi } from "../backend-api/walletDataApi";
import { coinToUSDRatesProvider } from "../external-apis/coinToUSDRatesProvider";
import { coinToUSDRateAtSpecificDateProvider } from "../external-apis/coinToUSDRateAtSpecificDateProvider";

/**
 * Implements retrieving and caching of Coins to USD and USD to fiat rates data.
 * Caching is used to avoid number of calls of external services to improve performance of the application.
 */
export default class CoinsToFiatRatesService {
    static _intervalUpdatingCoinsUSDRate = null;
    static _intervalUpdatingUSDFiatRates = null;

    static _selectedCurrency = null;
    static _cache = {
        // TODO: [featurr, moderate] Switch to using the standard "cache" object and fix tests
        coinsUsdRate: [],
        usdFiatRates: [],
    };

    static USD_CURRENCY_CODE = "USD";

    /**
     * Schedules auto update of coins -> usd and usd -> fiat rates.
     *
     * This method should be called during the initialization to ensure update of rates data.
     */
    static scheduleCoinsToFiatRatesUpdate() {
        try {
            this._intervalUpdatingCoinsUSDRate != null && clearInterval(this._intervalUpdatingCoinsUSDRate);
            this._intervalUpdatingUSDFiatRates != null && clearInterval(this._intervalUpdatingUSDFiatRates);

            this._intervalUpdatingCoinsUSDRate = setInterval(() => {
                (async () => await this._tryToUpdateCachedCoinsUSDRate())();
            }, COINS_TO_FIAT_RATES_LIFETIME);

            this._intervalUpdatingUSDFiatRates = setInterval(() => {
                (async () => await this._tryToUpdateCachedUSDFiatRates())();
            }, USD_FIAT_RATES_LIFETIME);
        } catch (e) {
            improveAndRethrow(e, "scheduleCoinsToFiatRatesUpdate");
        }
    }

    static async _tryToUpdateCachedCoinsUSDRate() {
        try {
            const newRates = await coinToUSDRatesProvider.getCoinsToUSDRates();
            if (newRates != null) {
                this._cache.coinsUsdRate = newRates;
            } else {
                throw new Error("Failed to retrieve new coins-usd rates.");
            }
        } catch (e) {
            logError(e, null, "Failed to update coins-usd rates. ");
        }
    }

    static async _tryToUpdateCachedUSDFiatRates() {
        try {
            const newRates = await USDFiatRatesProvider.getUSDFiatRates();
            if (newRates != null && newRates.length) {
                this._cache.usdFiatRates = newRates.filter(item => FiatCurrenciesService.isCodeValid(item.currency));
            } else {
                throw new Error("Failed to retrieve new usd-fiat rates.");
            }
        } catch (e) {
            logError(e, null, "Failed to update usd-fiat rates data. ");
        }
    }

    /**
     * Returns coin-usd rate data
     * @param coin {Coin} coin to get usd rate for
     * @returns {Promise<{
                    currency: string,
                    currencyName: string,
                    rate: number,
                    symbol: string,
                    decimalCount: number
                }>}
     */
    static async getCoinToUSDRate(coin) {
        try {
            await this._fillCacheIfNeeded();

            const coinUsdRate = this._cache.coinsUsdRate.find(item => item.coin.ticker === coin.ticker);
            if (!coinUsdRate?.usdRate) {
                throw new Error("No rate for given coin: " + coin.ticker);
            }

            return {
                currency: this.USD_CURRENCY_CODE,
                currencyName: FiatCurrenciesService.getFullCurrencyNameByCode(this.USD_CURRENCY_CODE),
                rate: +coinUsdRate.usdRate.toFixed(
                    FiatCurrenciesService.getCurrencyDecimalCountByCode(this.USD_CURRENCY_CODE)
                ),
                symbol: FiatCurrenciesService.getCurrencySymbolByCode(this.USD_CURRENCY_CODE),
                decimalCount: FiatCurrenciesService.getCurrencyDecimalCountByCode(this.USD_CURRENCY_CODE),
            };
        } catch (e) {
            improveAndRethrow(e, "getCoinToUSDRate");
        }
    }

    /**
     * Retrieves list of fiat currencies. Note that currencies list is composed dynamically on base of
     * list returned by external API providing rates.
     *
     * @returns {Promise<Array<{
     *               currency: string,
     *               currencyName: string,
     *               symbol: string,
     *               decimalCount: number
     *           }>>}
     */
    static async getListOfFiatCurrencies() {
        try {
            await this._fillCacheIfNeeded();

            const currenciesList = this._cache.usdFiatRates.map(rate => rate.currency);
            !currenciesList.includes(this.USD_CURRENCY_CODE) && currenciesList.push(this.USD_CURRENCY_CODE);

            return currenciesList.map(code => {
                return {
                    currency: code,
                    currencyName: FiatCurrenciesService.getFullCurrencyNameByCode(code),
                    symbol: FiatCurrenciesService.getCurrencySymbolByCode(code),
                    decimalCount: FiatCurrenciesService.getCurrencyDecimalCountByCode(code),
                };
            });
        } catch (e) {
            improveAndRethrow(e, "getListOfFiatCurrencies");
        }
    }

    /**
     * Retrieves list of popular fiat currencies. We filter cached list of currencies as it is dynamic, and we cannot
     * guaranty with 100% probability exact currency is inside it.
     *
     * @param [numberOfCurrencies] {number} number of currencies to return
     * @returns {Promise<Array<{
     *               currency: string,
     *               currencyName: string,
     *               symbol: string,
     *               decimalCount: number
     *           }>>} sorted by popularity descending
     */
    static async getListOfMostPopularFiatCurrencies(numberOfCurrencies = 7) {
        try {
            await this._fillCacheIfNeeded();

            const mostPopular = [this.USD_CURRENCY_CODE, "EUR", "CNH", "GBP", "CHF", "CAD", "JPY"].slice(
                0,
                numberOfCurrencies
            );
            const codesList = mostPopular.filter(
                c => c === this.USD_CURRENCY_CODE || this._cache.usdFiatRates.find(rate => rate.currency === c)
            );
            return codesList.map(code => {
                return {
                    currency: code,
                    currencyName: FiatCurrenciesService.getFullCurrencyNameByCode(code),
                    symbol: FiatCurrenciesService.getCurrencySymbolByCode(code),
                    decimalCount: FiatCurrenciesService.getCurrencyDecimalCountByCode(code),
                };
            });
        } catch (e) {
            improveAndRethrow(e, "getListOfMostPopularFiatCurrencies");
        }
    }

    /**
     * Retrieves currently selected fiat currency data
     *
     * @return {Promise<{
     *              currency: string,
     *              currencyName: string,
     *              symbol: string,
     *              decimalCount: number
     *          }>}
     */
    static async getCurrentFiatCurrencyData() {
        try {
            const currencyCode = await this._getAndSaveFiatCurrencyCodeIfNeeded();
            return {
                currency: currencyCode,
                currencyName: FiatCurrenciesService.getFullCurrencyNameByCode(currencyCode),
                symbol: FiatCurrenciesService.getCurrencySymbolByCode(currencyCode),
                decimalCount: FiatCurrenciesService.getCurrencyDecimalCountByCode(currencyCode),
            };
        } catch (e) {
            improveAndRethrow(e, "getCurrentFiatCurrencyData");
        }
    }

    /**
     * Retrieves default fiat currency data
     *
     * @return {{
     *              currency: string,
     *              currencyName: string,
     *              symbol: string,
     *              decimalCount: number
     *          }}
     */
    static getDefaultFiatCurrencyData() {
        try {
            return {
                currency: this.USD_CURRENCY_CODE,
                currencyName: FiatCurrenciesService.getFullCurrencyNameByCode(this.USD_CURRENCY_CODE),
                symbol: FiatCurrenciesService.getCurrencySymbolByCode(this.USD_CURRENCY_CODE),
                decimalCount: FiatCurrenciesService.getCurrencyDecimalCountByCode(this.USD_CURRENCY_CODE),
            };
        } catch (e) {
            improveAndRethrow(e, "getDefaultFiatCurrencyData");
        }
    }

    /**
     * Saves given fiat currency code on server
     *
     * @param code {string} of the currency to be saved
     * @throws Error if given code is not supported or invalid
     */
    static async saveCurrentFiatCurrency(code) {
        try {
            if (!FiatCurrenciesService.isCodeValid(code)) {
                throw new Error("Code is not valid.");
            }

            await WalletDataApi.savePreference(getWalletId(), "currencyCode", code);
            this._selectedCurrency = code;
        } catch (e) {
            improveAndRethrow(e, "saveCurrentFiatCurrency");
        }
    }

    static async _fillCacheIfNeeded() {
        if (this._cache.coinsUsdRate == null || !this._cache.coinsUsdRate.length) {
            try {
                await this._tryToUpdateCachedCoinsUSDRate();
            } catch (e) {
                logError(e, "_fillCacheIfNeeded", "Failed to save coins-usd rates to local service cache.");
            }
        }

        if (this._cache.usdFiatRates == null || !this._cache.usdFiatRates.length) {
            try {
                await this._tryToUpdateCachedUSDFiatRates();
            } catch (e) {
                logError(e, "_fillCacheIfNeeded", "Failed to save usd-fiat rates to local service cache.");
            }
        }
    }

    static async _getAndSaveFiatCurrencyCodeIfNeeded() {
        try {
            await this._fillCacheIfNeeded();

            if (this._selectedCurrency != null && this._selectedCurrency !== this.USD_CURRENCY_CODE) {
                const rateData = this._cache.usdFiatRates.find(rate => rate.currency === this._selectedCurrency);
                // TODO: [feature, moderate] Notify user that we changed the currency automatically
                !rateData && (await this._saveDefaultCurrencyCode());
            } else if (!this._selectedCurrency) {
                try {
                    const walletData = await WalletDataApi.getWalletData(getWalletId());
                    const code = (walletData?.settings?.currencyCode || "").toUpperCase();
                    const rateData = this._cache.usdFiatRates.find(rate => rate.currency === code);
                    if (rateData != null) {
                        this._selectedCurrency = code;
                    }
                } catch (e) {
                    this._selectedCurrency = null;
                    logError(e, "_getAndSaveFiatCurrencyCodeIfNeeded", "Failed to get saved currency code.");
                } finally {
                    if (!this._selectedCurrency) {
                        await this._saveDefaultCurrencyCode();
                    }
                }
            }

            return this._selectedCurrency;
        } catch (e) {
            improveAndRethrow(e, "_getAndSaveFiatCurrencyCodeIfNeeded");
        }
    }

    static async _saveDefaultCurrencyCode() {
        this._selectedCurrency = this.USD_CURRENCY_CODE;
        try {
            await WalletDataApi.savePreference(getWalletId(), "currencyCode", this.USD_CURRENCY_CODE);
        } catch (e) {
            logError(e, "_saveDefaultCurrencyCode", "Failed to save USD currency code.");
        }
    }

    /**
     * Retrieves usd-fiat rate for currently selected currency.
     *
     * @return {Promise<number>} rate value
     */
    static async getUSDtoCurrentSelectedFiatCurrencyRate() {
        try {
            await Promise.all([
                this._fillCacheIfNeeded().catch(e => logError(e, null, "Failed to fill cache.")),
                this._getAndSaveFiatCurrencyCodeIfNeeded(),
            ]);

            if (this._selectedCurrency !== this.USD_CURRENCY_CODE) {
                const rate = this._cache.usdFiatRates.find(item => item.currency === this._selectedCurrency)?.rate;
                if (rate) {
                    return rate;
                }
            }

            return 1;
        } catch (e) {
            improveAndRethrow(e, "getUSDtoCurrentSelectedFiatCurrencyRate");
        }
    }

    /**
     * Retrieves rate for given coin for the specified date (or current date if timestamp is not specified) from cache
     * or external service and returns rate for currently selected currency.
     * Saves currency if there is no saved one. Also retrieves rates if needed.
     *
     * @param coin {Coin} coin to get the rate for
     * @param timestamp {number} timestamp to get date by
     * @returns {Promise<{
     *              currency: string,
     *              currencyName: string,
     *              rate: number,
     *              symbol: string,
     *              decimalCount: number
     *          }>|null} null if there is an error during the rate retrieval
     */
    static async getCoinToCurrentFiatCurrencyRateForSpecificDate(coin, timestamp = Date.now()) {
        const loggerSource = "getCoinToCurrentFiatCurrencyRateForSpecificDate";
        let dateString;
        try {
            dateString = new Date(timestamp).toDateString();
            Logger.log(`Start getting rate: ${dateString} ${coin.ticker}`, loggerSource);
            await this._fillCacheIfNeeded();
            let coinUsdRate;
            if (new Date().toDateString() === new Date(timestamp).toDateString()) {
                coinUsdRate = this._cache.coinsUsdRate.find(item => item.coin.ticker === coin.ticker)?.usdRate;
                Logger.log(`Got for current date for ${coin.ticker}: ${coinUsdRate}`, loggerSource);
            } else {
                coinUsdRate = await coinToUSDRateAtSpecificDateProvider.getCoinToUSDRateAtSpecificDate(coin, timestamp);
                Logger.log(`Got for ${dateString} for ${coin.ticker}: ${coinUsdRate}`, loggerSource);
            }

            if (!coinUsdRate) {
                Logger.log(`Not found for ${coin.ticker} at ${dateString}: ${coinUsdRate}`, loggerSource);
                throw new Error("No rate for given coin: " + coin.ticker);
            }

            let currentFiatCurrency = (await this._getAndSaveFiatCurrencyCodeIfNeeded()) || this.USD_CURRENCY_CODE;
            let usdToFiatRate = this._cache.usdFiatRates.find(rate => rate.currency === currentFiatCurrency)?.rate ?? 1;
            (!usdToFiatRate || usdToFiatRate === 1) && (currentFiatCurrency = this.USD_CURRENCY_CODE);

            return {
                currency: currentFiatCurrency,
                currencyName: FiatCurrenciesService.getFullCurrencyNameByCode(currentFiatCurrency),
                rate: +(coinUsdRate * usdToFiatRate).toFixed(
                    FiatCurrenciesService.getCurrencyDecimalCountByCode(currentFiatCurrency)
                ),
                decimals: FiatCurrenciesService.getCurrencyDecimalCountByCode(currentFiatCurrency),
                symbol: FiatCurrenciesService.getCurrencySymbolByCode(currentFiatCurrency),
            };
        } catch (e) {
            Logger.log(
                `Returning null due to error for ${coin.ticker} ${dateString}: ${JSON.stringify(e)}`,
                loggerSource
            );
            return null;
        }
    }

    /**
     * Converts array of coin amounts to array of amount in current fiat currency.
     * If no rate is retrieved or invalid rate is retrieved returns array of nulls.
     *
     * @param coin {Coin} coin to convert the values for
     * @param amountsList {number[]} array of amounts in coin to be converted
     * @param digitsAfterTheDot {number|null} custom digits after the dot count
     *
     * @returns {Promise<Array<number|null>>} Promise resolving to fiat amounts array
     */
    static async convertCoinAmountsToFiat(coin, amountsList, digitsAfterTheDot = null) {
        try {
            let coinToFiatRate = await this.getCoinToCurrentFiatCurrencyRateForSpecificDate(coin);

            return amountsList.map(amount => {
                if (coinToFiatRate?.rate == null || amount == null || !(typeof amount === "number")) {
                    return null;
                }

                return +(amount * coinToFiatRate.rate).toFixed(digitsAfterTheDot ?? coinToFiatRate?.decimalCount ?? 2);
            });
        } catch (e) {
            improveAndRethrow(e, "convertCoinAmountsToFiat");
        }
    }

    /**
     * Converts array of fiat amounts to array of amount in coins.
     * If no rate is retrieved or invalid rate is retrieved returns array of nulls.
     *
     * @param coin {Coin} coin to convert the values for
     * @param amountsList {number[]} array of amounts in fiat to be converted
     * @param digitsAfterTheDot {number|null} custom digits after the dot count
     *
     * @returns {Promise<Array<string|null>>} Promise resolving into coins amounts array
     */
    static async convertFiatAmountsToCoins(coin, amountsList, digitsAfterTheDot = null) {
        try {
            let coinToFiatRate = await CoinsToFiatRatesService.getCoinToCurrentFiatCurrencyRateForSpecificDate(coin);
            if (!coinToFiatRate || coinToFiatRate.rate == null) {
                return amountsList.map(() => null);
            }

            return amountsList.map(amount => {
                if (amount == null) {
                    return null;
                }
                let converted = (amount / coinToFiatRate.rate).toFixed(coin.digits);
                return converted === "0." + "0".repeat(coin.digits) ? "" : converted;
            });
        } catch (e) {
            improveAndRethrow(e, "convertFiatAmountsToCoins");
        }
    }
}
