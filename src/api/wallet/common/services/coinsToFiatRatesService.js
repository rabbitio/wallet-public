import { improveAndRethrow, logError } from "../../../common/utils/errorUtils";
import FiatCurrenciesService from "../../../fiat/services/internal/fiatCurrenciesService";
import USDFiatRatesProvider from "../../../fiat/external-apis/usdFiatRatesExternalAPIs";
import { Logger } from "../../../support/services/internal/logs/logger";
import { coinToUSDRatesProvider } from "../external-apis/coinToUSDRatesProvider";
import { coinToUSDRateAtSpecificDateProvider } from "../external-apis/coinToUSDRateAtSpecificDateProvider";
import { EventBus, FIAT_CURRENCY_CHANGED_EVENT } from "../../../common/adapters/eventbus";
import { PreferencesService } from "./preferencesService";
import { UserDataAndSettings } from "../models/userDataAndSettings";

/**
 * Implements retrieving and caching of Coins to USD and USD to fiat rates data.
 * Caching is used to avoid number of calls of external services to improve performance of the application.
 */
export default class CoinsToFiatRatesService {
    static USD_CURRENCY_CODE = "USD";

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
            const rates = await coinToUSDRatesProvider.getCoinsToUSDRates();
            const coinUsdRate = rates.find(item => item.coin.ticker === coin.ticker);
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
            const rates = await USDFiatRatesProvider.getUSDFiatRates();
            const currenciesList = rates.map(rate => rate.currency);
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
            const mostPopular = [this.USD_CURRENCY_CODE, "EUR", "CNH", "GBP", "CHF", "CAD", "JPY"].slice(
                0,
                numberOfCurrencies
            );
            const usdFiatRates = await USDFiatRatesProvider.getUSDFiatRates();
            const codesList = mostPopular.filter(
                code => code === this.USD_CURRENCY_CODE || usdFiatRates.find(rate => rate.currency === code)
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
     * @return {{
     *              currency: string,
     *              currencyName: string,
     *              symbol: string,
     *              decimalCount: number
     *          }}
     */
    static getCurrentFiatCurrencyData() {
        try {
            const currencyCode =
                PreferencesService.getUserSettingValue(UserDataAndSettings.SETTINGS.CURRENCY_CODE) ??
                this.USD_CURRENCY_CODE;
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

            await PreferencesService.cacheAndSaveSetting(UserDataAndSettings.SETTINGS.CURRENCY_CODE, code);

            EventBus.dispatch(FIAT_CURRENCY_CHANGED_EVENT);
        } catch (e) {
            improveAndRethrow(e, "saveCurrentFiatCurrency");
        }
    }

    /**
     * Retrieves usd-fiat rate for currently selected currency.
     *
     * @return {Promise<number>} rate value
     */
    static async getUSDtoCurrentSelectedFiatCurrencyRate() {
        try {
            let currentlySelectedFiatCurrencyCode;
            try {
                currentlySelectedFiatCurrencyCode = PreferencesService.getUserSettingValue(
                    UserDataAndSettings.SETTINGS.CURRENCY_CODE
                );
            } catch (e) {
                logError(e, null, "Failed to fill cache.");
                currentlySelectedFiatCurrencyCode = this.USD_CURRENCY_CODE;
            }
            if (currentlySelectedFiatCurrencyCode !== this.USD_CURRENCY_CODE) {
                const usdFiatRates = await USDFiatRatesProvider.getUSDFiatRates();
                const rate = usdFiatRates.find(item => item.currency === currentlySelectedFiatCurrencyCode)?.rate;
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

            let coinUsdRate;
            if (new Date().toDateString() === new Date(timestamp).toDateString()) {
                const coinsUsdRates = await coinToUSDRatesProvider.getCoinsToUSDRates();
                coinUsdRate = coinsUsdRates.find(item => item.coin.ticker === coin.ticker)?.usdRate;
            } else {
                coinUsdRate = await coinToUSDRateAtSpecificDateProvider.getCoinToUSDRateAtSpecificDate(coin, timestamp);
                Logger.log(`Got for ${dateString} for ${coin.ticker}: ${coinUsdRate}`, loggerSource);
            }

            if (coinUsdRate == null) {
                Logger.log(`Not found for ${coin.ticker} at ${dateString}: ${coinUsdRate}`, loggerSource);
                throw new Error("No rate for given coin: " + coin.ticker);
            }

            let currentFiatCurrency =
                PreferencesService.getUserSettingValue(UserDataAndSettings.SETTINGS.CURRENCY_CODE) ??
                this.USD_CURRENCY_CODE;
            const usdFiatRates = await USDFiatRatesProvider.getUSDFiatRates();
            let usdToFiatRate = usdFiatRates.find(rate => rate.currency === currentFiatCurrency)?.rate ?? null;
            if (usdToFiatRate == null) {
                currentFiatCurrency = this.USD_CURRENCY_CODE;
                usdToFiatRate = 1;
            }

            return {
                currency: currentFiatCurrency,
                currencyName: FiatCurrenciesService.getFullCurrencyNameByCode(currentFiatCurrency),
                rate: +coinUsdRate * usdToFiatRate,
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
