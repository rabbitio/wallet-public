import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { ApiGroups } from "../../../common/external-apis/apiGroups";
import { getCurrentNetwork } from "../../../common/services/internal/storage";
import { Coins } from "../../coins";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";

class EtherscanErc20SingleBalanceProvider extends ExternalApiProvider {
    constructor() {
        super("", "get", 15000, ApiGroups.ETHERSCAN);
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const networkPrefix = getCurrentNetwork(Coins.COINS.ETH) === Coins.COINS.ETH.mainnet ? "" : "-goerli";
            const address = params[0];
            const tokenAddress = params[1];
            // NOTE: add api key if you decide to use paid API '&apikey=YourApiKeyToken'
            return `https://api${networkPrefix}.etherscan.io/api?module=account&action=tokenbalance&contractaddress=${tokenAddress}&address=${address}&tag=latest`;
        } catch (e) {
            improveAndRethrow(e, "EtherscanErc20SingleBalanceProvider.composeQueryString");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            const balanceAtomsString = "" + response?.data?.result;
            if (!/^\d+$/.test(balanceAtomsString))
                throw new Error("Wrong format of token balance from etherscan: " + balanceAtomsString);
            return balanceAtomsString;
        } catch (e) {
            improveAndRethrow(e, "EtherscanErc20SingleBalanceProvider.getDataByResponse");
        }
    }
}

export class Erc20SingleBalanceProvider {
    static _provider = new CachedRobustExternalApiCallerService(
        "erc20SingleBalanceProvider",
        [new EtherscanErc20SingleBalanceProvider()],
        120000,
        130,
        1000,
        false
    );

    /**
     * Retrieves erc20 token balance for given address
     *
     * @param address {string} address to get balance for
     * @param coin {Coin} token to get balance for
     * @return {Promise<string>} balance string atoms
     */
    static async getErc20TokenBalance(address, coin) {
        try {
            return this._provider.callExternalAPICached(
                [address, coin.tokenAddress],
                15000,
                null,
                1,
                params => `single_token_balance_${params[0]}_${params[1]}`
            );
        } catch (e) {
            improveAndRethrow(e, "getErc20TokenBalance");
        }
    }
}
