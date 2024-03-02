import { improveAndRethrow } from "@rabbitio/ui-kit";

import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider.js";
import { ApiGroups } from "../../../common/external-apis/apiGroups.js";
import { safeStringify } from "../../../common/utils/browserUtils.js";
import RobustExternalAPICallerService from "../../../common/services/utils/robustExteranlApiCallerService/robustExternalAPICallerService.js";
import { API_KEYS_PROXY_URL } from "../../../common/backend-api/utils.js";

class AlchemyEthereumPushTransactionProvider extends ExternalApiProvider {
    constructor() {
        super("", "post", 15000, ApiGroups.ALCHEMY, {});
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            return `${API_KEYS_PROXY_URL}/${this.apiGroup.backendProxyIdGenerator()}`;
        } catch (e) {
            improveAndRethrow(e, "AlchemyEthereumPushTransactionProvider.composeQueryString");
        }
    }

    composeBody(params, subRequestIndex = 0) {
        try {
            const txHexData = params[0];
            return JSON.stringify({
                id: 1,
                jsonrpc: "2.0",
                params: [txHexData],
                method: "eth_sendRawTransaction",
            });
        } catch (e) {
            improveAndRethrow(e, "AlchemyEthereumPushTransactionProvider.composeBody");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            const txId = response?.data?.result;
            if (txId) return txId;
            throw new Error(`Failed to push ethereum transaction: ${safeStringify(response?.data)}`);
        } catch (e) {
            improveAndRethrow(e, "AlchemyEthereumPushTransactionProvider.getDataByResponse");
        }
    }
}

export class EthereumPushTransactionProvider {
    static bio = "ethereumPushTransactionProvider";
    static _provider = new RobustExternalAPICallerService(this.bio, [new AlchemyEthereumPushTransactionProvider()]);

    /**
     * @param hexTransaction {string} signed ethereum transaction in hex format
     * @return {Promise<string>} transaction id the tx is successfully pushed to blockchain
     */
    static async pushRawEthereumTransaction(hexTransaction) {
        try {
            return await this._provider.callExternalAPI([hexTransaction], 30000, null, 1);
        } catch (e) {
            improveAndRethrow(e, "pushRawEthereumTransaction");
        }
    }
}
