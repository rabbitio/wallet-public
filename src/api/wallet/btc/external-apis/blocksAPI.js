import { improveAndRethrow } from "@rabbitio/ui-kit";

import { Coins } from "../../coins.js";
import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService.js";
import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider.js";
import { ApiGroups } from "../../../common/external-apis/apiGroups.js";

// TODO: [feature, moderate] Add mempool.space provider https://mempool.space/api/v1/blocks task_id=a8370ae7b99049b092f31f761a95b54d
class BlockstreamBtcCurrentBlockProvider extends ExternalApiProvider {
    constructor() {
        super("https://blockstream.info/", "get", 15000, ApiGroups.BLOCKSTREAM);
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const network = params[0];
            const networkPath = network.key === Coins.COINS.BTC.testnet.key ? "testnet/" : "";
            return `${networkPath}api/blocks/tip/height`;
        } catch (e) {
            improveAndRethrow(e, "BlockstreamBtcCurrentBlockProvider.composeQueryString");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            return +response.data || null;
        } catch (e) {
            improveAndRethrow(e, "BlockstreamBtcCurrentBlockProvider.getDataByResponse");
        }
    }
}

class BlockchainInfoBtcCurrentBlockProvider extends ExternalApiProvider {
    constructor() {
        super("https://blockchain.info/latestblock?cors=true", "get", 15000, ApiGroups.BLOCKCHAIN_INFO);
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            return params[0].key === Coins.COINS.BTC.mainnet.key ? +response.data?.height ?? null : null;
        } catch (e) {
            improveAndRethrow(e, "BlockchainInfoBtcCurrentBlockProvider.getDataByResponse");
        }
    }
}

class BtcDotComCurrentBlockProvider extends ExternalApiProvider {
    constructor() {
        super("https://chain.api.btc.com/v3/block/latest", "get", 7000, ApiGroups.BTCCOM);
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            return +response.data.height || null;
        } catch (e) {
            improveAndRethrow(e, "BtcDotComCurrentBlockProvider.getDataByResponse");
        }
    }
}

export class ExternalBlocksApiCaller {
    static _provider = new CachedRobustExternalApiCallerService(
        "externalBlocksAPICaller",
        [
            new BlockstreamBtcCurrentBlockProvider(),
            new BtcDotComCurrentBlockProvider(),
            new BlockchainInfoBtcCurrentBlockProvider(),
        ],
        90000 // Using custom TTL as we need some not so high and not so small TTL - blocks count is used for transactions actualization
    );

    static async retrieveCurrentBlockNumber(network, cancelToken = null) {
        try {
            return await this._provider.callExternalAPICached([network], 15000, cancelToken, 2, () => network.key);
        } catch (e) {
            improveAndRethrow(e, "retrieveCurrentBlockNumber");
        }
    }
}
