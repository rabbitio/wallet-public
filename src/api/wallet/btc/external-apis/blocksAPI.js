import { Coins } from "../../coins";
import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";
import { improveAndRethrow } from "../../../common/utils/errorUtils";

const providers = [
    {
        endpoint: "https://blockstream.info/",
        timeout: 15000,
        RPS: 10,
        httpMethod: "get",
        composeQueryString: params => {
            const network = params[0];
            const networkPath = network.key === Coins.COINS.BTC.testnet.key ? "testnet/" : "";
            return `${networkPath}api/blocks/tip/height`;
        },
        getDataByResponse: response => +response.data || null,
    },
    {
        endpoint: "https://blockchain.info/latestblock?cors=true",
        timeout: 15000,
        RPS: 30, // Just an assumption
        httpMethod: "get",
        composeQueryString: params => "",
        getDataByResponse: (response, params) =>
            params[0].key === Coins.COINS.BTC.mainnet.key ? +response.data?.height ?? null : null,
    },
    {
        endpoint: "https://chain.api.btc.com/v3/block/latest",
        timeout: 7000,
        RPS: 0.1,
        httpMethod: "get",
        composeQueryString: () => "",
        getDataByResponse: response => +response.data.height || null,
    },
    // TODO: [feature, low] add more APIs (for testnet)
];

export class ExternalBlocksApiCaller {
    static _provider = new CachedRobustExternalApiCallerService("externalBlocksAPICaller", providers, 5000, 50, 500);

    static async retrieveCurrentBlockNumber(network, cancelToken = null) {
        try {
            return await this._provider.callExternalAPICached([network], 5000, cancelToken, 2, () => network.key);
        } catch (e) {
            improveAndRethrow(e, "retrieveCurrentBlockNumber");
        }
    }
}
