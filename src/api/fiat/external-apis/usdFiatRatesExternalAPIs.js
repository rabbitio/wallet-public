import { improveAndRethrow } from "../../common/utils/errorUtils";
import { CachedRobustExternalApiCallerService } from "../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";
import { ExternalApiProvider } from "../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { ApiGroups } from "../../common/external-apis/apiGroups";
import FiatCurrenciesService from "../services/internal/fiatCurrenciesService";

class ExchangerateUsdFiatRatesProvider extends ExternalApiProvider {
    constructor() {
        super("https://api.exchangerate.host/latest?base=USD", "get", 15000, ApiGroups.EXCHANGERATE);
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            let rates = response.data.rates;

            if (!rates || Object.keys(rates).length === 0) {
                return null;
            }

            rates = Object.keys(rates).map(code => ({
                currency: code,
                rate: +rates[code],
            }));

            return rates;
        } catch (e) {
            improveAndRethrow(e, "ExchangerateUsdFiatRatesProvider.getDataByResponse");
        }
    }
}

class FrankfurterUsdFiatRatesProvider extends ExternalApiProvider {
    constructor() {
        super("https://api.frankfurter.app/latest?from=USD", "get", 15000, ApiGroups.FRANKFURTER);
    }
    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            let rates = response.data.rates;

            if (!rates || Object.keys(rates).length === 0) {
                return null;
            }

            rates = Object.keys(rates).map(code => ({
                currency: code,
                rate: +rates[code],
            }));

            return rates;
        } catch (e) {
            improveAndRethrow(e, "FrankfurterUsdFiatRatesProvider.getDataByResponse");
        }
    }
}

class BlockchaininfoUsdFiatRatesProvider extends ExternalApiProvider {
    constructor() {
        super("https://blockchain.info/ticker?cors=true", "get", 15000, ApiGroups.BLOCKCHAIN_INFO);
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
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
        } catch (e) {
            improveAndRethrow(e, "BlockchaininfoUsdFiatRatesProvider.getDataByResponse");
        }
    }
}

export default class USDFiatRatesProvider {
    static externalUSDFiatRatesAPICaller = new CachedRobustExternalApiCallerService(
        "externalUSDFiatRatesAPICaller",
        [
            new ExchangerateUsdFiatRatesProvider(),
            new FrankfurterUsdFiatRatesProvider(),
            new BlockchaininfoUsdFiatRatesProvider(),
        ],
        400000,
        50,
        1000,
        false
    );

    /**
     * Retrieves USD-><currency> rates.
     * Final set of currencies is dynamic.
     *
     * TODO: [feature, critical] Use static fiat currencies set and server-based storing. task_id=879a8a86507240a2a61e867c14973317
     *
     * @returns {Promise<Array<{ currency: string, rate: number }>>}
     */
    static async getUSDFiatRates() {
        try {
            const result = await this.externalUSDFiatRatesAPICaller.callExternalAPICached([], 15000, null, 2);
            return result.filter(item => FiatCurrenciesService.isCodeValid(item.currency));
        } catch (e) {
            improveAndRethrow(e, "getUSDFiatRates");
        }
    }
}
