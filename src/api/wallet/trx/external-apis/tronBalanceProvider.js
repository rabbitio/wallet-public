import {
    improveAndRethrow,
    CachedRobustExternalApiCallerService,
    ExternalApiProvider,
    ApiGroups,
} from "@rabbitio/ui-kit";

import { Coins } from "../../coins.js";
import { tronUtils } from "../adapters/tronUtils.js";
import {
    createRawBalanceAtomsCacheProcessorForSingleBalanceProvider,
    mergeSingleBalanceValuesAndNotifyAboutValueChanged,
} from "../../common/utils/cacheActualizationUtils.js";
import { API_KEYS_PROXY_URL } from "../../../common/backend-api/utils.js";
import { STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS } from "../../../common/utils/ttlConstants.js";
import { Storage } from "../../../common/services/internal/storage.js";
import { cache } from "../../../common/utils/cache.js";

class TrongridTronBalanceProvider extends ExternalApiProvider {
    constructor() {
        super("", "post", 15000, ApiGroups.TRONGRID);
    }

    composeQueryString(params, subRequestIndex = 0) {
        const originalApiPath = "/wallet/getaccount";
        return `${API_KEYS_PROXY_URL}/${this.apiGroup.backendProxyIdGenerator(Storage.getCurrentNetwork(Coins.COINS.TRX)?.key)}${originalApiPath}`;
    }

    composeBody(params, subRequestIndex = 0) {
        try {
            const hexAddress = tronUtils.base58checkAddressToHex(params[0]);
            return `{ "address": "${hexAddress}" }`;
        } catch (e) {
            improveAndRethrow(e, "trongridTronBalanceProvider.composeBody");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            if (Object.keys(response.data).length === 0) {
                // This provider returns empty object for inactivated TRX addresses. So we treat this as 0 balance
                return "0";
            }

            const balance = "" + response?.data?.balance;
            if (balance == null || !balance.match(/^\d+$/))
                throw new Error("Failed to retrieve balance trx from trongrid: " + balance);
            return balance;
        } catch (e) {
            improveAndRethrow(e, "trongridTronBalanceProvider.getDataByResponse");
        }
    }
}

export class TronBalanceProvider {
    static _provider = new CachedRobustExternalApiCallerService(
        "tronBalanceProvider",
        cache,
        [new TrongridTronBalanceProvider()], // TODO: [feature, high] add more providers. task_id=c246262b0e7f43dfa2a9b0e30c947ad7
        STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS,
        false,
        (cached, newValue) =>
            mergeSingleBalanceValuesAndNotifyAboutValueChanged(cached, newValue, Coins.COINS.TRX.ticker)
    );

    /**
     * @param address {string}
     * @return {Promise<string>}
     */
    static async getTronBalance(address) {
        try {
            return await this._provider.callExternalAPICached([address], 15000, null, 1, customHashFunctionForParams);
        } catch (e) {
            improveAndRethrow(e, "getTronBalance");
        }
    }

    /**
     * @param address {string}
     */
    static markTronBalanceAsExpiredButDontRemove(address) {
        this._provider.markCacheAsExpiredButDontRemove([address], customHashFunctionForParams);
    }

    /**
     * @param address {string}
     * @param valueAtoms {string}
     * @param sign {number}
     */
    static actualizeBalanceCacheWithAmount(address, valueAtoms, sign) {
        try {
            const processor = createRawBalanceAtomsCacheProcessorForSingleBalanceProvider(valueAtoms, sign);
            this._provider.actualizeCachedData([address], processor, customHashFunctionForParams);
        } catch (e) {
            improveAndRethrow(e, "actualizeBalanceCacheWithAmount");
        }
    }
}

const customHashFunctionForParams = params => `balance_${Coins.COINS.TRX.ticker}-${params[0]}`;
