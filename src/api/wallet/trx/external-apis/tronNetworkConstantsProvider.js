import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";
import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { getCurrentNetwork } from "../../../common/services/internal/storage";
import { Coins } from "../../coins";
import { TRONGR_PR_K } from "../../../../properties";
import { ApiGroups } from "../../../common/external-apis/apiGroups";

class TronscanNetworkConstantsProvider extends ExternalApiProvider {
    constructor() {
        super("https://apilist.tronscan.org/api/chainparameters", "get", 15000, ApiGroups.TRONSCAN);
    }

    composeQueryString(params, subRequestIndex = 0) {
        if (getCurrentNetwork(Coins.COINS.TRX) !== Coins.COINS.TRX.mainnet) {
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
        super("", "get", 15000, ApiGroups.TRONGRID, { "TRON-PRO-API-KEY": TRONGR_PR_K });
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const networkPrefix = getCurrentNetwork(Coins.COINS.TRX) === Coins.COINS.TRX.mainnet ? "api" : "nile";
            return `https://${networkPrefix}.trongrid.io/wallet/getchainparameters`;
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
        2 * 60 * 60 * 1000, // Not so frequent expiration as the tron network parameters change really rarely
        100,
        2000,
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
