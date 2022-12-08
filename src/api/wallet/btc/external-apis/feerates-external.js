import { FEE_RATES_SERVICE_ENDPOINT } from "../../../../properties";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { FeeRate } from "../models/feeRate";
import { Coins } from "../../coins";
import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";

const providers = [
    {
        // This provider returns specific block numbers like 6, 21, not exactly our numbers
        endpoint: "https://www.bitgo.com/api/v2/btc/tx/fee",
        httpMethod: "get",
        timeout: 6000,
        composeQueryString: () => "",
        getDataByResponse: response => {
            let rates = response.data?.feeByBlockTarget ?? null;
            rates = rates
                ? Object.keys(rates)
                      .map(blocksCount =>
                          Math.round(rates[blocksCount] / 1000) > 0
                              ? new FeeRate(
                                    Coins.COINS.BTC.mainnet.key,
                                    +blocksCount,
                                    Math.round(rates[blocksCount] / 1000)
                                )
                              : []
                      )
                      .flat()
                : null;
            return rates.length ? rates : null;
        },
    },
    {
        // This provider returns rate per vbyte and for desired confirmation time. We use rough converting - block confirmation time is 30 minutes
        endpoint: "https://bitcoiner.live/api/fees/estimates/latest",
        httpMethod: "get",
        timeout: 6000,
        composeQueryString: () => "",
        getDataByResponse: response => {
            let rates = response.data?.estimates ?? null;
            rates = rates
                ? Object.keys(rates).map(blocksCount =>
                      Math.round(rates[blocksCount].sat_per_vbyte) > 0
                          ? new FeeRate(
                                Coins.COINS.BTC.mainnet.key,
                                Math.round(+blocksCount / 30), // Rough minutes to blocks count converting
                                Math.round(rates[blocksCount].sat_per_vbyte)
                            )
                          : []
                  )
                : null;
            return rates.length ? rates : null;
        },
    },
    {
        // This provider returns pretty strange data usually - a lot of block numbers but almost all rates are the same
        endpoint: "https://blockstream.info/api/fee-estimates",
        httpMethod: "get",
        timeout: 6000,
        composeQueryString: () => "",
        getDataByResponse: response => {
            let rates = response.data ?? null;
            rates = rates
                ? Object.keys(rates).map(blocksCount =>
                      Math.round(rates[blocksCount]) > 0
                          ? new FeeRate(Coins.COINS.BTC.mainnet.key, +blocksCount, Math.round(rates[blocksCount]))
                          : []
                  )
                : null;
            return rates.length ? rates : null;
        },
    },
    {
        // TODO: [refactoring, moderat Remove this provider when this service will be downed
        endpoint: FEE_RATES_SERVICE_ENDPOINT,
        httpMethod: "get",
        timeout: 8000,
        composeQueryString: () => "",
        getDataByResponse: response => {
            if (!Array.isArray(response?.data)) {
                throw new Error("Wrong fee data has been passed.");
            }

            return response.data.map(feeRate => {
                if (feeRate.network && feeRate.blocksCount && feeRate.rate) {
                    const network =
                        feeRate.network === "livenet"
                            ? Coins.COINS.BTC.mainnet
                            : feeRate.network === "testnet"
                            ? Coins.COINS.BTC.testnet
                            : null;

                    if (!network)
                        throw new Error(`Cannot recognize network from external fee rates service, got: ${network}`);

                    return new FeeRate(network.key, feeRate.blocksCount, Math.round(feeRate.rate / 1000));
                }

                throw new Error(`Wrong feeRate format: ${JSON.stringify(feeRate)}`);
            });
        },
    },
];

const robustFeeRatsRetriever = new CachedRobustExternalApiCallerService(
    "robustFeeRatsRetriever",
    providers,
    15000,
    30,
    2000
);

export async function getFeesFromExtService() {
    try {
        return await robustFeeRatsRetriever.callExternalAPICached();
    } catch (e) {
        improveAndRethrow(e, "getFeesFromExtService");
    }
}
