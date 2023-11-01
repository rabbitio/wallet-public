import { BigNumber } from "ethers";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";
import { ApiGroups } from "../../../common/external-apis/apiGroups";
import { API_KEYS_PROXY_URL } from "../../../common/backend-api/utils";
import { PERMANENT_TTL_FOR_RARE_CHANGING_DATA_MS } from "../../../common/utils/ttlConstants";

class AlchemyTransactionReceiptProvider extends ExternalApiProvider {
    constructor() {
        super("", "post", 15000, ApiGroups.ALCHEMY);
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            return `${API_KEYS_PROXY_URL}/${this.apiGroup.backendProxyIdGenerator()}`;
        } catch (e) {
            improveAndRethrow(e, "alchemyTransactionReceiptProvider.composeQueryString");
        }
    }

    composeBody(params, subRequestIndex = 0) {
        const id = params[0];
        try {
            return {
                id: 1,
                jsonrpc: "2.0",
                params: [id],
                method: "eth_getTransactionReceipt",
            };
        } catch (e) {
            improveAndRethrow(e, "alchemyTransactionReceiptProvider.composeBody");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            const gas = response?.data?.result?.gasUsed;
            const gasPrice = response?.data?.result?.effectiveGasPrice;
            if (gas == null || gasPrice == null) return null;
            return BigNumber.from(gas)
                .mul(gasPrice)
                .toString();
        } catch (e) {
            improveAndRethrow(e, "alchemyTransactionReceiptProvider.getDataByResponse");
        }
    }
}

export class EthereumBlockchainTransactionFeeProvider {
    static _provider = new CachedRobustExternalApiCallerService(
        "ethereumBlockchainTransactionFeeProvider",
        [new AlchemyTransactionReceiptProvider()],
        PERMANENT_TTL_FOR_RARE_CHANGING_DATA_MS, // As receipt is constant for committed transactions
        false,
        null,
        20 // It is not critical to fail fast for this provider
    );

    static async getEthereumBlockchainTransactionFee(txId) {
        try {
            return await this._provider.callExternalAPICached(
                [txId],
                15000,
                null,
                1,
                params => `ethereum_tx_fee_${params[0]}`
            );
        } catch (e) {
            improveAndRethrow(e, "getEthereumBlockchainTransactionFee");
        }
    }
}
