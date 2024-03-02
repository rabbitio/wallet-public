import { improveAndRethrow } from "@rabbitio/ui-kit";

import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService.js";
import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider.js";
import { Storage } from "../../../common/services/internal/storage.js";
import { Coins } from "../../coins.js";
import { ApiGroups } from "../../../common/external-apis/apiGroups.js";
import { API_KEYS_PROXY_URL } from "../../../common/backend-api/utils.js";
import { LONG_TTL_FOR_REALLY_RARELY_CHANGING_DATA_MS } from "../../../common/utils/ttlConstants.js";

class TronscanNetworkConstantsProvider extends ExternalApiProvider {
    constructor() {
        super("https://apilist.tronscan.org/api/chainparameters", "get", 15000, ApiGroups.TRONSCAN);
    }

    composeQueryString(params, subRequestIndex = 0) {
        if (Storage.getCurrentNetwork(Coins.COINS.TRX) !== Coins.COINS.TRX.mainnet) {
            throw new Error("Tronscan provider doesn't support test networks (in network parameters retrieval)");
        }
        return "";
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            const data = response.data;
            if (data && Array.isArray(data.tronParameters)) {
                const bandwidthFee = data.tronParameters.find(item => item?.key === "getTransactionFee")?.value;
                const energyFee = data.tronParameters.find(item => item?.key === "getEnergyFee")?.value;
                if (bandwidthFee != null && energyFee != null) {
                    return { energyPriceSuns: energyFee, bandwidthPriceSuns: bandwidthFee };
                }
            }
            return null;
        } catch (e) {
            improveAndRethrow(e, "tronscanNetworkConstantsProvider.getDataByResponse");
        }
    }
}

class TrongridNetworkConstantsProvider extends ExternalApiProvider {
    constructor() {
        super("", "get", 15000, ApiGroups.TRONGRID);
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const originalApiPath = "/wallet/getchainparameters";
            return `${API_KEYS_PROXY_URL}/${this.apiGroup.backendProxyIdGenerator()}${originalApiPath}`;
        } catch (e) {
            improveAndRethrow(e, "trongridNetworkConstantsProvider.composeQueryString");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            const data = response.data;
            if (data && Array.isArray(data.chainParameter)) {
                const bandwidthFee = data.chainParameter.find(item => item?.key === "getTransactionFee")?.value;
                const energyFee = data.chainParameter.find(item => item?.key === "getEnergyFee")?.value;
                if (bandwidthFee != null && energyFee != null) {
                    return { energyPriceSuns: energyFee, bandwidthPriceSuns: bandwidthFee };
                }
            }
            return null;
        } catch (e) {
            improveAndRethrow(e, "trongridNetworkConstantsProvider.getDataByResponse");
        }
    }
}

export class TronNetworkConstantsProvider {
    static _provider = new CachedRobustExternalApiCallerService(
        "tronNetworkConstantsProvider",
        [new TronscanNetworkConstantsProvider(), new TrongridNetworkConstantsProvider()],
        LONG_TTL_FOR_REALLY_RARELY_CHANGING_DATA_MS, // Long lifetime as the tron network parameters change really rarely
        false
    );

    /**
     * Retrieves constants object. Return null if all providers fail.
     *
     * @return {Promise<{ energyPriceSuns: number, bandwidthPriceSuns: number }|null>}
     */
    static async getTronNetworkConstants() {
        try {
            return await this._provider.callExternalAPICached([], 15000, null, 1, null, true);
        } catch (e) {
            improveAndRethrow(e, "getTronNetworkConstants");
        }
    }
}
