import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { ApiGroups } from "../../../common/external-apis/apiGroups";
import { Coins } from "../../coins";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";
import { BigNumber } from "ethers";
import {
    createRawBalanceAtomsCacheProcessorForMultiBalancesProvider,
    mergeTwoArraysByItemIdFieldName,
    mergeTwoBalancesArraysAndNotifyAboutBalanceValueChange,
} from "../../common/utils/cacheActualizationUtils";
import { API_KEYS_PROXY_URL } from "../../../common/backend-api/utils";
import { STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS } from "../../../common/utils/ttlConstants";

class AlchemyErc20AllBalancesProvider extends ExternalApiProvider {
    constructor() {
        super("", "post", 15000, ApiGroups.ALCHEMY);
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            return `${API_KEYS_PROXY_URL}/${this.apiGroup.backendProxyIdGenerator()}`;
        } catch (e) {
            improveAndRethrow(e, "AlchemyErc20AllBalancesProvider.composeQueryString");
        }
    }

    composeBody(params, subRequestIndex = 0) {
        try {
            const address = params[0];
            return {
                id: 1,
                jsonrpc: "2.0",
                method: "alchemy_getTokenBalances",
                params: [address, "erc20"],
            };
        } catch (e) {
            improveAndRethrow(e, "AlchemyErc20AllBalancesProvider.composeBody");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            const balances = response?.data?.result?.tokenBalances;
            if (!Array.isArray(balances)) throw new Error("Wrong format of token balances from alchemy: " + balances);
            const coins = Coins.getSupportedCoinsList();
            return balances
                .map(balanceData => {
                    const coin = coins.find(c => c.tokenAddress === balanceData.contractAddress);
                    if (coin) {
                        return {
                            ticker: coin.ticker,
                            balance: BigNumber.from(balanceData.tokenBalance).toString(),
                        };
                    }
                    return [];
                })
                .flat();
        } catch (e) {
            improveAndRethrow(e, "AlchemyErc20AllBalancesProvider.getDataByResponse");
        }
    }
}

export class Erc20AllBalancesProvider {
    static _provider = new CachedRobustExternalApiCallerService(
        "erc20AllBalancesProvider",
        [new AlchemyErc20AllBalancesProvider()],
        STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS,
        false,
        mergeTwoBalancesArraysAndNotifyAboutBalanceValueChange
    );

    /**
     * Retrieves balances for all supported erc20 tokens provided by given API
     *
     * @param address {string} address to get balances for
     * @return {Promise<{ ticker: string, balance: string }[]>}
     */
    static async getErc20Balances(address) {
        try {
            return this._provider.callExternalAPICached([address], 15000, null, 1, hashFunctionForParams);
        } catch (e) {
            improveAndRethrow(e, "getErc20Balances");
        }
    }

    static addErc20BalanceToCache(coin, address, balanceAtomsString) {
        try {
            this._provider.actualizeCachedData(
                [address],
                currentCache => ({
                    data: mergeTwoArraysByItemIdFieldName(
                        currentCache,
                        [{ balance: balanceAtomsString, ticker: coin.ticker }],
                        "ticker"
                    ),
                    isModified: true,
                }),
                hashFunctionForParams
            );
        } catch (e) {
            improveAndRethrow(e, "addErc20BalanceToCache");
        }
    }

    static markErc20BalancesAsExpired(address) {
        this._provider.markCacheAsExpiredButDontRemove([address], hashFunctionForParams);
    }

    static actualizeBalanceCacheWithAmountAtoms(coin, address, amountAtoms, sign) {
        const cacheProcessor = createRawBalanceAtomsCacheProcessorForMultiBalancesProvider(coin, amountAtoms, sign);
        this._provider.actualizeCachedData([address], cacheProcessor, hashFunctionForParams);
    }
}
const hashFunctionForParams = params => `all_erc20_balances_${params[0]}`;
