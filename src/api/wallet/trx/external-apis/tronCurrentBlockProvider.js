import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { getCurrentNetwork } from "../../../common/services/internal/storage";
import { Coins } from "../../coins";
import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { TRONGR_PR_K, GETBL_PR_K } from "../../../../properties";
import { ApiGroups } from "../../../common/external-apis/apiGroups";

class TrongridCurrentBlockProvider extends ExternalApiProvider {
    constructor() {
        super("", "post", 15000, ApiGroups.TRONGRID, { "TRON-PRO-API-KEY": TRONGR_PR_K });
    }

    composeQueryString(params, subRequestIndex = 0) {
        const network = getCurrentNetwork(Coins.COINS.TRX);
        return `https://${network === Coins.COINS.TRX.mainnet ? "api" : "nile"}.trongrid.io/wallet/getnowblock`;
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        return response?.data?.block_header?.raw_data?.number ?? null;
    }
}

class TronscanCurrentBlockProvider extends ExternalApiProvider {
    constructor() {
        super("https://apilist.tronscan.org/api/block/latest", "get", 15000, ApiGroups.TRONSCAN, {});
    }

    composeQueryString(params, subRequestIndex = 0) {
        const network = getCurrentNetwork(Coins.COINS.TRX);
        if (network !== Coins.COINS.TRX.mainnet) {
            throw new Error("Deliberate fail to stop processing for tronscan as it doesn't support testnet for tron");
        }

        return "";
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        return response.data.number ?? null;
    }
}

class GetblockTronCurrentBlockProvider extends ExternalApiProvider {
    constructor() {
        super("", "get", 15000, ApiGroups.GETBLOCK);
    }

    composeQueryString(params, subRequestIndex = 0) {
        const network = getCurrentNetwork(Coins.COINS.TRX) === Coins.COINS.TRX.mainnet ? "mainnet" : "testnet";
        return `https://trx.getblock.io/${GETBL_PR_K}/${network}/wallet/getnowblock`;
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        return response.data;
    }
}

/**
 * @deprecated
 * @since 0.8.0: Note used for now. Leaving for future needs
 */
export class TronCurrentBlockProvider {
    static _provider = new CachedRobustExternalApiCallerService(
        "tronCurrentBlockProvider",
        [
            new TronscanCurrentBlockProvider(),
            new GetblockTronCurrentBlockProvider(),
            new TrongridCurrentBlockProvider(),
        ],
        70000,
        60,
        2000,
        false
    );
    static async getCurrentTronBlock() {
        try {
            const network = getCurrentNetwork(Coins.COINS.TRX);
            return await this._provider.callExternalAPICached(
                [],
                10000,
                null,
                1,
                () => `current_block_tron_${network.key}`
            );
        } catch (e) {
            improveAndRethrow(e, "getCurrentTronBlock");
        }
    }
}
