import { BigNumber } from "bignumber.js";

import { AmountUtils, improveAndRethrow } from "@rabbitio/ui-kit";

import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService.js";
import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider.js";
import { ApiGroups } from "../../../common/external-apis/apiGroups.js";
import { API_KEYS_PROXY_URL } from "../../../common/backend-api/utils.js";
import { SMALL_TTL_FOR_FREQ_CHANGING_DATA_MS } from "../../../common/utils/ttlConstants.js";

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
                return AmountUtils.intStr(BigNumber(data));
            } else if (subRequestIndex === 1) {
                return AmountUtils.intStr(BigNumber(data?.baseFeePerGas));
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
     * @return {Promise<{ maxFeePerGas: string, maxPriorityFeePerGas: string }>}
     */
    static async getEthereumFeeData() {
        try {
            const result = await this._provider.callExternalAPICached([], 15000, null, 1, hashFunctionForParams);
            const maxPriorityFeePerGas = result[0];
            const baseFeePerGas = result[1];
            const maxFeePerGas = AmountUtils.intStr(BigNumber(baseFeePerGas).plus(maxPriorityFeePerGas));
            return { maxFeePerGas: maxFeePerGas, maxPriorityFeePerGas: maxPriorityFeePerGas };
        } catch (e) {
            improveAndRethrow(e, "getEthereumFeeData");
        }
    }
}

const hashFunctionForParams = params => `ethereum_fee_data_alchemy`;
