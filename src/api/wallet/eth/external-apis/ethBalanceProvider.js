import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { BigNumber } from "ethers";
import { getCurrentNetwork } from "../../../common/services/internal/storage";
import { Coins } from "../../coins";
import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { ApiGroups } from "../../../common/external-apis/apiGroups";
import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";
import {
    createRawBalanceAtomsCacheProcessorForSingleBalanceProvider,
    mergeSingleBalanceValuesAndNotifyAboutValueChanged,
} from "../../common/utils/cacheActualizationUtils";
import { API_KEYS_PROXY_URL } from "../../../common/backend-api/utils";
import { STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS } from "../../../common/utils/ttlConstants";

class AlchemyEthBalanceProvider extends ExternalApiProvider {
    constructor() {
        super("", "post", 15000, ApiGroups.ALCHEMY);
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            return `${API_KEYS_PROXY_URL}/${this.apiGroup.backendProxyIdGenerator()}`;
        } catch (e) {
            improveAndRethrow(e, "AlchemyEthBalanceProvider.composeQueryString");
        }
    }

    composeBody(params, subRequestIndex = 0) {
        try {
            const address = params[0];
            return {
                id: 1,
                jsonrpc: "2.0",
                params: [address, "latest"],
                method: "eth_getBalance",
            };
        } catch (e) {
            improveAndRethrow(e, "AlchemyEthBalanceProvider.composeBody");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            const balanceHex = "" + response?.data?.result;
            if (!/^0x[\da-fA-F]+$/.test(balanceHex))
                throw new Error("Wrong balance response from alchemy for eth: " + balanceHex);
            return BigNumber.from(balanceHex).toString();
        } catch (e) {
            improveAndRethrow(e, "AlchemyEthBalanceProvider.getDataByResponse");
        }
    }
}

class EtherscanEthBalanceProvider extends ExternalApiProvider {
    constructor() {
        super("", "get", 15000, ApiGroups.ETHERSCAN);
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const networkPrefix = getCurrentNetwork(Coins.COINS.ETH) === Coins.COINS.ETH.mainnet ? "" : "-goerli";
            const address = params[0];
            // NOTE: add api key if you decide to use paid API '&apikey=YourApiKeyToken'
            return `https://api${networkPrefix}.etherscan.io/api?module=account&action=balance&address=${address}&tag=latest`;
        } catch (e) {
            improveAndRethrow(e, "EtherscanEthBalanceProvider.composeQueryString");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            const balanceWeiString = "" + response?.data?.result;
            if (!/^\d+$/.test(balanceWeiString))
                throw new Error("Wrong format of eth balance from etherscan: " + balanceWeiString);
            return balanceWeiString;
        } catch (e) {
            improveAndRethrow(e, "EtherscanEthBalanceProvider.getDataByResponse");
        }
    }
}

export class EthBalanceProvider {
    static _provider = new CachedRobustExternalApiCallerService(
        "ethBalanceProvider",
        [new EtherscanEthBalanceProvider(), new AlchemyEthBalanceProvider()],
        STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS,
        false,
        (cached, newValue) =>
            mergeSingleBalanceValuesAndNotifyAboutValueChanged(cached, newValue, Coins.COINS.ETH.ticker)
    );

    /**
     * Retrieves ether balance for address
     *
     * @param address {string} address to get ETH balance for
     * @returns {Promise<string>}
     */
    static async getEthBalanceForAddress(address) {
        try {
            return await this._provider.callExternalAPICached([address], 15000, null, 1, customHashFunctionForParams);
        } catch (e) {
            improveAndRethrow(e, "getEthBalanceForAddress");
        }
    }

    static markEthBalanceCacheAsExpiredButDontRemove(address) {
        this._provider.markCacheAsExpiredButDontRemove([address], customHashFunctionForParams);
    }

    static actualizeBalanceCacheWithAmountAtoms(address, amountAtoms, sign) {
        const cacheProcessor = createRawBalanceAtomsCacheProcessorForSingleBalanceProvider(amountAtoms, sign);
        this._provider.actualizeCachedData([address], cacheProcessor, customHashFunctionForParams);
    }
}

const customHashFunctionForParams = params => `only_eth_balance_${params[0]}`;
