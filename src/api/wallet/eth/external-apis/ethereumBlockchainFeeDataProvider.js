import { BigNumber } from "ethers";
import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { ApiGroups } from "../../../common/external-apis/apiGroups";
import { API_KEYS_PROXY_URL } from "../../../common/backend-api/utils";
import { SMALL_TTL_FOR_FREQ_CHANGING_DATA_MS } from "../../../common/utils/ttlConstants";

class AlchemyEthereumBlockchainFeeDataProvider extends ExternalApiProvider {
    constructor() {
        super("", ["post", "post"], 15000, ApiGroups.ALCHEMY, {});
    }

    doesRequireSubRequests() {
        return true;
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            return `${API_KEYS_PROXY_URL}/${this.apiGroup.backendProxyIdGenerator()}`;
        } catch (e) {
            improveAndRethrow(e, "AlchemyEthereumBlockchainFeeDataProvider.composeQueryString");
        }
    }

    composeBody(params, subRequestIndex = 0) {
        try {
            if (subRequestIndex === 0) {
                return JSON.stringify({
                    id: "1",
                    jsonrpc: "2.0",
                    method: "eth_maxPriorityFeePerGas",
                });
            } else if (subRequestIndex === 1) {
                return JSON.stringify({
                    id: 1,
                    jsonrpc: "2.0",
                    method: "eth_getBlockByNumber",
                    params: ["latest", false],
                });
            }
        } catch (e) {
            improveAndRethrow(e, "AlchemyEthereumBlockchainFeeDataProvider.composeBody");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            const data = response?.data?.result;
            if (subRequestIndex === 0) {
                return BigNumber.from(data);
            } else if (subRequestIndex === 1) {
                return BigNumber.from(data?.baseFeePerGas);
            }
        } catch (e) {
            improveAndRethrow(e, "AlchemyEthereumBlockchainFeeDataProvider.getDataByResponse");
        }
    }
}

export class EthereumBlockchainFeeDataProvider {
    static bio = "ethereumBlockchainFeeDataProvider";
    static _provider = new CachedRobustExternalApiCallerService(
        this.bio,
        [new AlchemyEthereumBlockchainFeeDataProvider()],
        SMALL_TTL_FOR_FREQ_CHANGING_DATA_MS,
        false
    );

    /**
     * @return {Promise<{ maxFeePerGas: BigNumber, maxPriorityFeePerGas: BigNumber }>}
     */
    static async getEthereumFeeData() {
        try {
            const result = await this._provider.callExternalAPICached([], 15000, null, 1, hashFunctionForParams);
            const maxPriorityFeePerGas = result[0];
            const baseFeePerGas = result[1];
            const maxFeePerGas = baseFeePerGas.add(maxPriorityFeePerGas);
            return { maxFeePerGas: maxFeePerGas, maxPriorityFeePerGas: maxPriorityFeePerGas };
        } catch (e) {
            improveAndRethrow(e, "getEthereumFeeData");
        }
    }
}

const hashFunctionForParams = params => `ethereum_fee_data_alchemy`;
