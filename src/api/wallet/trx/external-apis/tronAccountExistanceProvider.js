import {
    improveAndRethrow,
    CachedRobustExternalApiCallerService,
    ExternalApiProvider,
    ApiGroups,
} from "@rabbitio/ui-kit";

import { Storage } from "../../../common/services/internal/storage.js";
import { Coins } from "../../coins.js";
import { API_KEYS_PROXY_URL } from "../../../common/backend-api/utils.js";
import { MODERATE_TTL_FOR_RELATIVELY_FREQ_CHANGING_DATA_MS } from "../../../common/utils/ttlConstants.js";
import { cache } from "../../../common/utils/cache.js";

class TronscanAccountExistenceProvider extends ExternalApiProvider {
    constructor() {
        super("https://apilist.tronscan.org/api/account", "get", 10000, ApiGroups.TRONSCAN);
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            if (Storage.getCurrentNetwork(Coins.COINS.TRX) !== Coins.COINS.TRX.mainnet) {
                throw new Error("Tronscan provider doesn't support testnet for account existence check.");
            }
            return `?address=${params[0]}`;
        } catch (e) {
            improveAndRethrow(e, "tronscanAccountExistenceProvider.composeQueryString");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            return response?.data?.date_created != null && response?.data?.date_created > 0;
        } catch (e) {
            improveAndRethrow(e, "tronscanAccountExistenceProvider.getDataByResponse");
        }
    }
}

class TrongridAccountExistenceProvider extends ExternalApiProvider {
    constructor() {
        super("", "post", 10000, ApiGroups.TRONGRID);
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const originalApiPath = "/wallet/getaccount";
            return `${API_KEYS_PROXY_URL}/${this.apiGroup.backendProxyIdGenerator(Storage.getCurrentNetwork(Coins.COINS.TRX)?.key)}${originalApiPath}`;
        } catch (e) {
            improveAndRethrow(e, "trongridAccountExistenceProvider.composeQueryString");
        }
    }

    composeBody(params, subRequestIndex = 0) {
        try {
            return {
                address: params[0],
                visible: true,
            };
        } catch (e) {
            improveAndRethrow(e, "trongridAccountExistenceProvider.composeBody");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            if (response.data == null)
                throw new Error("Wrong format of data returned by trongrid provider for account existence");
            return (response?.data?.create_time ?? 0) > 0;
        } catch (e) {
            improveAndRethrow(e, "trongridAccountExistenceProvider.getDataByResponse");
        }
    }
}

export class TronAccountExistenceProvider {
    static _provider = new CachedRobustExternalApiCallerService(
        "tronAccountExistenceProvider",
        cache,
        [new TronscanAccountExistenceProvider(), new TrongridAccountExistenceProvider()],
        MODERATE_TTL_FOR_RELATIVELY_FREQ_CHANGING_DATA_MS
    );

    static async doesTronAccountExist(address) {
        try {
            return await this._provider.callExternalAPICached(
                [address],
                15000,
                null,
                1,
                params => `acc_exist_tron_${address}`,
                true
            );
        } catch (e) {
            improveAndRethrow(e, "doesTronAccountExist");
        }
    }
}
