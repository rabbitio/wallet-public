import { BigNumber } from "bignumber.js";

import {
    improveAndRethrow,
    CachedRobustExternalApiCallerService,
    ExternalApiProvider,
    ApiGroups,
} from "@rabbitio/ui-kit";

import { tronUtils } from "../../trx/adapters/tronUtils.js";
import { API_KEYS_PROXY_URL } from "../../../common/backend-api/utils.js";
import { LONG_TTL_FOR_REALLY_RARELY_CHANGING_DATA_MS } from "../../../common/utils/ttlConstants.js";
import { Storage } from "../../../common/services/internal/storage.js";
import { Coins } from "../../coins.js";
import { cache } from "../../../common/utils/cache.js";

class Trc20TransferEstimationTrongridProvider extends ExternalApiProvider {
    constructor() {
        super("", "post", 15000, ApiGroups.TRONGRID);
    }
    composeQueryString(params, subRequestIndex = 0) {
        try {
            const originalApiPath = "/wallet/triggerconstantcontract";
            return `${API_KEYS_PROXY_URL}/${this.apiGroup.backendProxyIdGenerator(Storage.getCurrentNetwork(Coins.COINS.TRX)?.key)}${originalApiPath}`;
        } catch (e) {
            improveAndRethrow(e, "Trc20TransferEstimationTrongridProvider.composeQueryString");
        }
    }

    composeBody(params, subRequestIndex = 0) {
        try {
            const coin = params[0];
            const addressFrom = params[1];
            const addressToHex = tronUtils.base58checkAddressToHex(params[2]);
            const amount = params[3];
            const encodedParameters = tronUtils.encodeParams([
                { type: "address", value: addressToHex },
                { type: "uint256", value: "0x" + BigNumber(amount).toString(16) },
            ]);
            return JSON.stringify({
                owner_address: addressFrom,
                contract_address: coin.tokenAddress,
                function_selector: "transfer(address,uint256)",
                parameter: encodedParameters,
                visible: true,
            });
        } catch (e) {
            improveAndRethrow(e, "trc20TransferEstimationTrongridProvider.composeBody");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            return response?.data?.energy_used ?? null;
        } catch (e) {
            improveAndRethrow(e, "trc20TransferEstimationTrongridProvider.getDataByResponse");
        }
    }
}

export class Trc20TransferEnergyEstimationProvider {
    static _provider = new CachedRobustExternalApiCallerService(
        "trc20TransferEnergyEstimationProvider",
        cache,
        [new Trc20TransferEstimationTrongridProvider()],
        LONG_TTL_FOR_REALLY_RARELY_CHANGING_DATA_MS // Energy estimation should mot change for the same transaction, so we use long TTL
    );

    /**
     * @param coin {Coin}
     * @param addressFrom {string}
     * @param addressTo {string}
     * @param amountAtoms {string}
     * @return {Promise<number>}
     */
    static async estimateTrc20TransferEnergy(coin, addressFrom, addressTo, amountAtoms) {
        try {
            return await this._provider.callExternalAPICached(
                [coin, addressFrom, addressTo, amountAtoms],
                15000,
                null,
                1,
                customHashFunctionForParams
            );
        } catch (e) {
            improveAndRethrow(e, "estimateTrc20TransferEnergy");
        }
    }
}

function customHashFunctionForParams(params) {
    return `${params[0].ticker}-${params[1]}-${params[2]}-${params[3]}`;
}
