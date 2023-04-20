import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { FeeRate } from "../models/feeRate";
import { Coins } from "../../coins";
import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";
import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { ApiGroups } from "../../../common/external-apis/apiGroups";

class BitgoBtcFeeRatesProvider extends ExternalApiProvider {
    constructor() {
        super("https://www.bitgo.com/api/v2/btc/tx/fee", "get", 10000, ApiGroups.BITGO);
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            // This provider returns specific block numbers like 6, 21, not exactly our numbers
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
        } catch (e) {
            improveAndRethrow(e, "BitgoBtcFeeRatesProvider.getDataByResponse");
        }
    }
}

class BitcoinerBtcFeeRatesProvider extends ExternalApiProvider {
    constructor() {
        super("https://bitcoiner.live/api/fees/estimates/latest", "get", 10000, ApiGroups.BITCOINER);
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            // This provider returns rate per vbyte and for desired confirmation time. We use rough converting - block confirmation time is 30 minutes
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
        } catch (e) {
            improveAndRethrow(e, "BitcoinerBtcFeeRatesProvider.getDataByResponse");
        }
    }
}

class BlockstreamBtcFeeRatesProvider extends ExternalApiProvider {
    constructor() {
        // This provider returns pretty strange data usually - a lot of block numbers but almost all rates are the same
        super("https://blockstream.info/api/fee-estimates", "get", 10000, ApiGroups.BLOCKSTREAM);
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            let rates = response.data ?? null;
            rates = rates
                ? Object.keys(rates).map(blocksCount =>
                      Math.round(rates[blocksCount]) > 0
                          ? new FeeRate(Coins.COINS.BTC.mainnet.key, +blocksCount, Math.round(rates[blocksCount]))
                          : []
                  )
                : null;
            return rates.length ? rates : null;
        } catch (e) {
            improveAndRethrow(e, "BlockstreamBtcFeeRatesProvider.getDataByResponse");
        }
    }
}

const robustFeeRatsRetriever = new CachedRobustExternalApiCallerService(
    "robustFeeRatsRetriever",
    [new BitgoBtcFeeRatesProvider(), new BitcoinerBtcFeeRatesProvider(), new BlockstreamBtcFeeRatesProvider()],
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
