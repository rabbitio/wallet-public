import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { BigNumber } from "ethers";
import { getCurrentNetwork } from "../../../common/services/internal/storage";
import { Coins } from "../../coins";
import { ETH_PR_ALC_GOERLI_K, ETH_PR_K } from "../../../../properties";
import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { ApiGroups } from "../../../common/external-apis/apiGroups";
import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";

class AlchemyEthBalanceProvider extends ExternalApiProvider {
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
        90000,
        100,
        1000,
        false
    );

    /**
     * Retrieves ether balance for address
     *
     * @param address {string} address to get ETH balance for
     * @returns {Promise<string>}
     */
    static async getEthBalanceForAddress(address) {
        try {
            return await this._provider.callExternalAPICached(
                [address],
                15000,
                null,
                1,
                params => `only_eth_balance_${params[0]}`
            );
        } catch (e) {
            improveAndRethrow(e, "getEthBalanceForAddress");
        }
    }
}
