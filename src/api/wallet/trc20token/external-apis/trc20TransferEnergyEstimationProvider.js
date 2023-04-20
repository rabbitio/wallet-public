import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";
import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { getCurrentNetwork } from "../../../common/services/internal/storage";
import { Coins } from "../../coins";
import { TRONGR_PR_K } from "../../../../properties";
import { tronUtils } from "../../trx/adapters/tronUtils";
import { BigNumber } from "ethers";
import { ApiGroups } from "../../../common/external-apis/apiGroups";

class Trc20TransferEstimationTrongridProvider extends ExternalApiProvider {
    constructor() {
        super("", "post", 15000, ApiGroups.TRONGRID, { "TRON-PRO-API-KEY": TRONGR_PR_K });
    }
    composeQueryString(params, subRequestIndex = 0) {
        const prefix = getCurrentNetwork(Coins.COINS.TRX) === Coins.COINS.TRX.mainnet ? "api" : "nile";
        return `https://${prefix}.trongrid.io/wallet/triggerconstantcontract`;
    }

    composeBody(params, subRequestIndex = 0) {
        try {
            const coin = params[0];
            const addressFrom = params[1];
            const addressToHex = tronUtils.base58checkAddressToHex(params[2]);
            const amount = params[3];
            const encodedParameters = tronUtils.encodeParams([
                { type: "address", value: addressToHex },
                { type: "uint256", value: BigNumber.from("" + amount).toHexString() },
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
        [new Trc20TransferEstimationTrongridProvider()],
        90000,
        100,
        1000
    );

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
