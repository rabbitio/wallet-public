import { improveAndRethrow } from "@rabbitio/ui-kit";

import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider.js";
import { ApiGroups } from "../../../common/external-apis/apiGroups.js";
import { Storage } from "../../../common/services/internal/storage.js";
import { Coins } from "../../coins.js";
import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService.js";
import {
    createRawBalanceAtomsCacheProcessorForSingleBalanceProvider,
    mergeSingleBalanceValuesAndNotifyAboutValueChanged,
} from "../../common/utils/cacheActualizationUtils.js";
import { STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS } from "../../../common/utils/ttlConstants.js";

class EtherscanErc20SingleBalanceProvider extends ExternalApiProvider {
    constructor() {
        super("", "get", 15000, ApiGroups.ETHERSCAN);
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const networkPrefix =
                Storage.getCurrentNetwork(Coins.COINS.ETH) === Coins.COINS.ETH.mainnet ? "" : "-goerli";
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
        STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS,
        false,
        (cached, newValue, params) =>
            mergeSingleBalanceValuesAndNotifyAboutValueChanged(
                cached,
                newValue,
                Coins.getCoinByContractAddress(params[1])?.ticker
            )
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
                this._composeParamsArray(address, coin),
                15000,
                null,
                1,
                hashFunctionForParams
            );
        } catch (e) {
            improveAndRethrow(e, "getErc20TokenBalance");
        }
    }

    static _composeParamsArray(address, coin) {
        return [address, coin.tokenAddress];
    }

    static markErc20BalanceAsExpired(coin, address) {
        this._provider.markCacheAsExpiredButDontRemove(this._composeParamsArray(address, coin), hashFunctionForParams);
    }

    static actualizeBalanceCacheWithAmountAtoms(coin, address, amountAtoms, sign) {
        const cacheProcessor = createRawBalanceAtomsCacheProcessorForSingleBalanceProvider(amountAtoms, sign);
        this._provider.actualizeCachedData(
            this._composeParamsArray(address, coin),
            cacheProcessor,
            hashFunctionForParams
        );
    }
}

const hashFunctionForParams = params => `single_token_balance_${params[0]}_${params[1]}`;
