import { BigNumber } from "ethers";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { ETH_PR_ALC_GOERLI_K, ETH_PR_K } from "../../../../properties";
import { Coins } from "../../coins";
import { getCurrentNetwork } from "../../../common/services/internal/storage";
import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";
import { ApiGroups } from "../../../common/external-apis/apiGroups";

class AlchemyTransactionReceiptProvider extends ExternalApiProvider {
    constructor() {
        super("", "post", 15000, ApiGroups.ALCHEMY);
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const isMainnet = getCurrentNetwork(Coins.COINS.ETH) === Coins.COINS.ETH.mainnet;
            const networkPrefix = isMainnet ? "mainnet" : "goerli";
            const apiKey = isMainnet ? ETH_PR_K : ETH_PR_ALC_GOERLI_K;
            return `https://eth-${networkPrefix}.g.alchemy.com/v2/${apiKey}`;
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
        30 * 60000, // Such a great ttl as receipt is constant for committed transactions
        20,
        1000,
        false
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
