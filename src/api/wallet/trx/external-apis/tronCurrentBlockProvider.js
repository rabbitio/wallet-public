import {
    improveAndRethrow,
    CachedRobustExternalApiCallerService,
    ExternalApiProvider,
    ApiGroups,
} from "@rabbitio/ui-kit";

import { Storage } from "../../../common/services/internal/storage.js";
import { Coins } from "../../coins.js";
import { API_KEYS_PROXY_URL } from "../../../common/backend-api/utils.js";
import { STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS } from "../../../common/utils/ttlConstants.js";
import { cache } from "../../../common/utils/cache.js";

class TrongridCurrentBlockProvider extends ExternalApiProvider {
    constructor() {
        super("", "post", 15000, ApiGroups.TRONGRID);
    }

    composeQueryString(params, subRequestIndex = 0) {
        const originalApiPath = "/wallet/getnowblock";
        return `${API_KEYS_PROXY_URL}/${this.apiGroup.backendProxyIdGenerator(Storage.getCurrentNetwork(Coins.COINS.TRX)?.key)}${originalApiPath}`;
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
        const network = Storage.getCurrentNetwork(Coins.COINS.TRX);
        if (network !== Coins.COINS.TRX.mainnet) {
            throw new Error("Deliberate fail to stop processing for tronscan as it doesn't support testnet for tron");
        }

        return "";
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        return response.data.number ?? null;
    }
}

// NOTE: disabled as not needed now. If you want to use it add proxying via backend as this service requires private API key
// class GetblockTronCurrentBlockProvider extends ExternalApiProvider {
//     constructor() {
//         super("", "get", 15000, ApiGroups.GETBLOCK);
//     }
//
//     composeQueryString(params, subRequestIndex = 0) {
//         const network = Storage.getCurrentNetwork(Coins.COINS.TRX) === Coins.COINS.TRX.mainnet ? "mainnet" : "testnet";
//         return `https://trx.getblock.io/${GETBL_PR_K}/${network}/wallet/getnowblock`;
//     }
//
//     getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
//         return response.data;
//     }
// }

/**
 * @deprecated
 * @since 0.8.0: Note used for now. Leaving for future needs
 */
export class TronCurrentBlockProvider {
    static _provider = new CachedRobustExternalApiCallerService(
        "tronCurrentBlockProvider",
        cache,
        [
            new TronscanCurrentBlockProvider(),
            // new GetblockTronCurrentBlockProvider(),
            new TrongridCurrentBlockProvider(),
        ],
        STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS,
        false
    );
    static async getCurrentTronBlock() {
        try {
            const network = Storage.getCurrentNetwork(Coins.COINS.TRX);
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
