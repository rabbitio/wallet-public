import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { ApiGroups } from "../../../common/external-apis/apiGroups";
import { BigNumber } from "ethers";
import { API_KEYS_PROXY_URL } from "../../../common/backend-api/utils";
import { SMALL_TTL_FOR_FREQ_CHANGING_DATA_MS } from "../../../common/utils/ttlConstants";

class AlchemyEthereumTransactionsCountProvider extends ExternalApiProvider {
    constructor() {
        super("", "post", 15000, ApiGroups.ALCHEMY, {});
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            return `${API_KEYS_PROXY_URL}/${this.apiGroup.backendProxyIdGenerator()}`;
        } catch (e) {
            improveAndRethrow(e, "AlchemyEthereumTransactionsCountProvider.composeQueryString");
        }
    }

    composeBody(params, subRequestIndex = 0) {
        try {
            return JSON.stringify({
                id: 1,
                jsonrpc: "2.0",
                params: [params[0], "latest"],
                method: "eth_getTransactionCount",
            });
        } catch (e) {
            improveAndRethrow(e, "AlchemyEthereumTransactionsCountProvider.composeBody");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            return BigNumber.from(response?.data?.result).toNumber();
        } catch (e) {
            improveAndRethrow(e, "AlchemyEthereumTransactionsCountProvider.getDataByResponse");
        }
    }
}

export class EthereumTransactionsCountProvider {
    static bio = "ethereumTransactionsCountProvider";
    static _provider = new CachedRobustExternalApiCallerService(
        this.bio,
        [new AlchemyEthereumTransactionsCountProvider(0)],
        SMALL_TTL_FOR_FREQ_CHANGING_DATA_MS,
        false
    );

    /**
     * @param address {string}
     * @return {Promise<number>}
     */
    static async getEthereumTransactionsCount(address) {
        try {
            return await this._provider.callExternalAPICached([address], 15000, null, 1, hashFunctionForParams);
        } catch (e) {
            improveAndRethrow(e, "getEthereumTransactionsCount");
        }
    }
}

const hashFunctionForParams = params => `ethereum_txs_count_${params[0]}`;
