import { BigNumber } from "bignumber.js";

import {
    AmountUtils,
    improveAndRethrow,
    CachedRobustExternalApiCallerService,
    ExternalApiProvider,
    ApiGroups,
} from "@rabbitio/ui-kit";

import { API_KEYS_PROXY_URL } from "../../../common/backend-api/utils.js";
import { SMALL_TTL_FOR_FREQ_CHANGING_DATA_MS } from "../../../common/utils/ttlConstants.js";
import { Storage } from "../../../common/services/internal/storage.js";
import { Coins } from "../../coins.js";
import { cache } from "../../../common/utils/cache.js";

class AlchemyEthereumBlockchainFeeDataProvider extends ExternalApiProvider {
    constructor() {
        super("", ["post", "post"], 15000, ApiGroups.ALCHEMY, {});
    }

    doesRequireSubRequests() {
        return true;
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            return `${API_KEYS_PROXY_URL}/${this.apiGroup.backendProxyIdGenerator(Storage.getCurrentNetwork(Coins.COINS.ETH)?.key)}`;
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
                return AmountUtils.toIntegerString(BigNumber(data));
            } else if (subRequestIndex === 1) {
                return AmountUtils.toIntegerString(BigNumber(data?.baseFeePerGas));
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
        cache,
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
            const maxFeePerGas = AmountUtils.toIntegerString(BigNumber(baseFeePerGas).plus(maxPriorityFeePerGas));
            return { maxFeePerGas: maxFeePerGas, maxPriorityFeePerGas: maxPriorityFeePerGas };
        } catch (e) {
            improveAndRethrow(e, "getEthereumFeeData");
        }
    }
}

const hashFunctionForParams = params => `ethereum_fee_data_alchemy`;
