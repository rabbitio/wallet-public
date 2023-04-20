import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { Coins } from "../../coins";
import { getCurrentNetwork } from "../../../common/services/internal/storage";
import { tronUtils } from "../adapters/tronUtils";
import { TRONGR_PR_K } from "../../../../properties";
import { ApiGroups } from "../../../common/external-apis/apiGroups";

class TrongridTronBalanceProvider extends ExternalApiProvider {
    constructor() {
        super("https://", "post", 15000, ApiGroups.TRONGRID, { "TRON-PRO-API-KEY": TRONGR_PR_K });
    }

    composeQueryString(params, subRequestIndex = 0) {
        const network = getCurrentNetwork(Coins.COINS.TRX);
        return `${network === Coins.COINS.TRX.mainnet ? "api" : "nile"}.trongrid.io/wallet/getaccount`;
    }

    composeBody(params, subRequestIndex = 0) {
        const hexAddress = tronUtils.base58checkAddressToHex(params[0]);
        return `{ "address": "${hexAddress}" }`;
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
        [new TrongridTronBalanceProvider()],
        60000,
        60,
        1000,
        false
    );

    static async getTronBalance(address) {
        try {
            return await this._provider.callExternalAPICached(
                [address],
                15000,
                null,
                1,
                () => `${Coins.COINS.TRX.ticker}-${address}`
            );
        } catch (e) {
            improveAndRethrow(e, "getTronBalance");
        }
    }
}
