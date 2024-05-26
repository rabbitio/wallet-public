import {
    AmountUtils,
    improveAndRethrow,
    CachedRobustExternalApiCallerService,
    ExternalApiProvider,
    ApiGroups,
} from "@rabbitio/ui-kit";

import { tronUtils } from "../../trx/adapters/tronUtils.js";
import { Coins } from "../../coins.js";
import {
    createRawBalanceAtomsCacheProcessorForSingleBalanceProvider,
    mergeSingleBalanceValuesAndNotifyAboutValueChanged,
} from "../../common/utils/cacheActualizationUtils.js";
import { API_KEYS_PROXY_URL } from "../../../common/backend-api/utils.js";
import { STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS } from "../../../common/utils/ttlConstants.js";
import { Storage } from "../../../common/services/internal/storage.js";
import { cache } from "../../../common/utils/cache.js";

class TrongridTrc20BalanceProvider extends ExternalApiProvider {
    constructor() {
        super("", "post", 15000, ApiGroups.TRONGRID);
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const originalApiPath = "/wallet/triggerconstantcontract";
            return `${API_KEYS_PROXY_URL}/${this.apiGroup.backendProxyIdGenerator(Storage.getCurrentNetwork(Coins.COINS.TRX)?.key)}${originalApiPath}`;
        } catch (e) {
            improveAndRethrow(e, "trongridTrc20BalanceProvider.composeQueryString");
        }
    }

    composeBody(params, subRequestIndex = 0) {
        try {
            const contractAddressHex = tronUtils.base58checkAddressToHex(params[0]);
            const accountAddressHex = tronUtils.base58checkAddressToHex(params[1]);
            return JSON.stringify({
                owner_address: accountAddressHex,
                contract_address: contractAddressHex,
                function_selector: "balanceOf(address)",
                parameter: tronUtils.encodeParams([{ type: "address", value: accountAddressHex }]),
                visible: false,
            });
        } catch (e) {
            improveAndRethrow(e, "trongridTrc20BalanceProvider.composeBody");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            const balanceHex = (response?.data?.constant_result ?? [])[0];
            if (balanceHex == null) throw new Error("Wrong balance retrieved for trc20: " + JSON.stringify(params));
            return AmountUtils.trim(`0x${balanceHex}`, 0);
        } catch (e) {
            improveAndRethrow(e, "trongridTrc20BalanceProvider.getDataByResponse");
        }
    }
}
export class Trc20BalanceProvider {
    static _provider = new CachedRobustExternalApiCallerService(
        "trc20BalanceProvider",
        cache,
        [new TrongridTrc20BalanceProvider()], // TODO: [feature, high] add more providers. task_id=c246262b0e7f43dfa2a9b0e30c947ad7
        STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS,
        false,
        (cached, newValue, params) =>
            mergeSingleBalanceValuesAndNotifyAboutValueChanged(
                cached,
                newValue,
                Coins.getCoinByContractAddress(params[0])?.ticker
            )
    );

    /**
     * Retrieves trc20 token balance string atoms
     *
     * @param coin {Coin} token to get balance for
     * @param address {string} address to get balance for
     * @returns {Promise<string>} balance atoms string
     */
    static async getTrc20Balance(coin, address) {
        try {
            return await this._provider.callExternalAPICached(
                [coin.tokenAddress, address],
                20000,
                null,
                1,
                customHashFunctionForParams
            );
        } catch (e) {
            improveAndRethrow(e, "getTrc20Balance");
        }
    }

    static markTrc20BalanceCacheAsExpired(coin, address) {
        this._provider.markCacheAsExpiredButDontRemove([coin.tokenAddress, address], customHashFunctionForParams);
    }

    static actualizeBalanceCacheWithAmount(address, coin, valuesAtoms, sign) {
        try {
            const cacheProcessor = createRawBalanceAtomsCacheProcessorForSingleBalanceProvider(valuesAtoms, sign);
            this._provider.actualizeCachedData(
                [coin.tokenAddress, address],
                cacheProcessor,
                customHashFunctionForParams
            );
        } catch (e) {
            improveAndRethrow(e, "actualizeBalanceCacheWithAmount");
        }
    }
}

const customHashFunctionForParams = params => `trc20_the_only_balance_${params[0]}-${params[1]}`;
