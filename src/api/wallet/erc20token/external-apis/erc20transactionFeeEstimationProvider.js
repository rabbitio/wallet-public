import { BigNumber } from "bignumber.js";

import { AmountUtils, improveAndRethrow, Logger } from "@rabbitio/ui-kit";

import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService.js";
import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider.js";
import { ApiGroups } from "../../../common/external-apis/apiGroups.js";
import { API_KEYS_PROXY_URL } from "../../../common/backend-api/utils.js";
import { SMALL_TTL_FOR_FREQ_CHANGING_DATA_MS } from "../../../common/utils/ttlConstants.js";

class AlchemyErc20TransactionFeeEstimationProvider extends ExternalApiProvider {
    constructor() {
        super("", "post", 15000, ApiGroups.ALCHEMY, {});
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            return `${API_KEYS_PROXY_URL}/${this.apiGroup.backendProxyIdGenerator()}`;
        } catch (e) {
            improveAndRethrow(e, "AlchemyErc20TransactionFeeEstimationProvider.composeQueryString");
        }
    }

    composeBody(params, subRequestIndex = 0) {
        try {
            const from = params[0];
            const to = params[1];
            const data = params[2];
            const defaultMaxGasAmountForErc20Transfer = params[3];
            const gasForEstimationCallHex = "0x" + BigNumber(defaultMaxGasAmountForErc20Transfer).toString(16);
            const body = JSON.stringify({
                id: 1,
                jsonrpc: "2.0",
                method: "eth_estimateGas",
                params: [
                    {
                        from: from,
                        to: to,
                        gas: gasForEstimationCallHex, // This is just for safety of this call as theoretically it can consume gas and RPC fails if no gas limit mentioned
                        value: "0x0", // ETH value for this transaction is 0 as we are estimating erc20 token transfer
                        data: data,
                    },
                ],
            });
            Logger.log(`Estimating erc20 gas for params ${body}`, "composeBody");
            return body;
        } catch (e) {
            improveAndRethrow(e, "AlchemyErc20TransactionFeeEstimationProvider.composeBody");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            return AmountUtils.intStr(response?.data?.result); // Passing hex string
        } catch (e) {
            improveAndRethrow(e, "AlchemyErc20TransactionFeeEstimationProvider.getDataByResponse");
        }
    }
}

export class Erc20TransactionFeeEstimationProvider {
    static bio = "erc20TransactionFeeEstimationProvider";
    static _provider = new CachedRobustExternalApiCallerService(
        this.bio,
        [new AlchemyErc20TransactionFeeEstimationProvider(0)],
        SMALL_TTL_FOR_FREQ_CHANGING_DATA_MS,
        false
    );

    /**
     * @param from {string} from address
     * @param to {string} to address
     * @param data {string} hex data
     * @param defaultMaxGasAmountForErc20Transfer {string}
     * @return {Promise<string>}
     */
    static async getErc20TransferFeeEstimation(from, to, data, defaultMaxGasAmountForErc20Transfer) {
        try {
            return await this._provider.callExternalAPICached(
                [from, to, data, defaultMaxGasAmountForErc20Transfer],
                15000,
                null,
                1,
                hashFunctionForParams
            );
        } catch (e) {
            improveAndRethrow(e, "getErc20TransferFeeEstimation");
        }
    }
}

const hashFunctionForParams = params => `erc20_fee_${params[0]}_${params[1]}_${params[2]}_${params[3]}`;
