import { doApiCall, urlWithPrefix } from "./utils";
import { improveAndRethrow } from "../../utils/errorUtils";

export default class FiatRatesApi {
    static serverEndpointEntity = "fiatRates";

    static async getFiatRatesHistoricalData() {
        try {
            const errorMessage = "Failed to get rates data from server. ";
            const url = `${urlWithPrefix}/${this.serverEndpointEntity}`;

            const ratesData = await doApiCall(url, "get", null, 200, errorMessage);

            return ratesData?.rates || [];
        } catch (e) {
            improveAndRethrow(e, "getFiatRatesHistoricalData");
        }
    }

    /**
     * Retrieves rate value for specific date.
     * WARNING! Will return 404 for current date as server stores only historical data.
     * TODO: [feature, low] consider storing today value on server
     *
     * @param dateTimestamp - timestamp of the date to get value for
     * @return {Promise<{r: number, t: number}>}
     */
    static async getFiatRateForSpecificDate(dateTimestamp) {
        try {
            const errorMessage = "Failed to get rate from server. ";
            const url = `${urlWithPrefix}/${this.serverEndpointEntity}/${dateTimestamp}`;

            const data = await doApiCall(url, "get", null, 200, errorMessage);

            return {
                t: data.t,
                r: data.r,
            };
        } catch (e) {
            improveAndRethrow(e, "getFiatRateForSpecificDate");
        }
    }
}
