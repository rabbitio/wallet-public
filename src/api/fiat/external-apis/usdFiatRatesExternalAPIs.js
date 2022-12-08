import { improveAndRethrow } from "../../common/utils/errorUtils";
import { CachedRobustExternalApiCallerService } from "../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";

/**
 * External APIs providing the usd rates for other currencies
 */
const providers = [
    {
        endpoint: "https://api.exchangerate.host/latest?base=USD",
        httpMethod: "get",
        composeQueryString: () => "",
        getDataByResponse: response => {
            let rates = response.data.rates;

            if (!rates || Object.keys(rates).length === 0) {
                return null;
            }

            rates = Object.keys(rates).map(code => ({
                currency: code,
                rate: +rates[code],
            }));

            return rates;
        },
    },
    {
        endpoint: "https://api.frankfurter.app/latest?from=USD",
        httpMethod: "get",
        composeQueryString: () => "",
        getDataByResponse: response => {
            let rates = response.data.rates;

            if (!rates || Object.keys(rates).length === 0) {
                return null;
            }

            rates = Object.keys(rates).map(code => ({
                currency: code,
                rate: +rates[code],
            }));

            return rates;
        },
    },
    {
        endpoint: "https://blockchain.info/ticker?cors=true",
        httpMethod: "get",
        composeQueryString: () => "",
        getDataByResponse: response => {
            let rates = response.data;
            const usdRate = rates["USD"]?.last;

            if (!rates || Object.keys(rates).length === 0 || !usdRate) {
                return null;
            }

            rates = Object.keys(rates).map(code => ({
                currency: code,
                rate: +rates[code].last / usdRate,
            }));

            return rates;
        },
    },
];

export default class USDFiatRatesProvider {
    static externalUSDFiatRatesAPICaller = new CachedRobustExternalApiCallerService(
        "externalUSDFiatRatesAPICaller",
        providers,
        60000,
        30,
        1500
    );

    /**
     * Retrieves USD-><currency> rates.
     * Final set of currencies is dynamic.
     * TODO: [bug, high] Use static fiat currencies set
     *
     * @returns {Promise<Array<{ currency: string, rate: number }>>}
     */
    static async getUSDFiatRates() {
        try {
            return this.externalUSDFiatRatesAPICaller.callExternalAPICached([], 10000, null, 2);
        } catch (e) {
            improveAndRethrow(e, "getUSDFiatRates");
        }
    }
}
