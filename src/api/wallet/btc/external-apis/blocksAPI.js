import { Coins } from "../../coins";
import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { ApiGroups } from "../../../common/external-apis/apiGroups";

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
            new BlockchainInfoBtcCurrentBlockProvider(),
            new BtcDotComCurrentBlockProvider(),
        ],
        90000,
        100,
        1000
    );

    static async retrieveCurrentBlockNumber(network, cancelToken = null) {
        try {
            return await this._provider.callExternalAPICached([network], 15000, cancelToken, 2, () => network.key);
        } catch (e) {
            improveAndRethrow(e, "retrieveCurrentBlockNumber");
        }
    }
}
