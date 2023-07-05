import { BigNumber } from "ethers";
import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";
import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { tronUtils } from "../../trx/adapters/tronUtils";
import { getCurrentNetwork } from "../../../common/services/internal/storage";
import { Coins } from "../../coins";
import { TRONGR_PR_K } from "../../../../properties";
import { ApiGroups } from "../../../common/external-apis/apiGroups";
import {
    createRawBalanceAtomsCacheProcessorForSingleBalanceProvider,
    mergeSingleBalanceValuesAndNotifyAboutValueChanged,
} from "../../common/utils/cacheActualizationUtils";

class TrongridTrc20BalanceProvider extends ExternalApiProvider {
    constructor() {
        super("https://", "post", 15000, ApiGroups.TRONGRID, { "TRON-PRO-API-KEY": TRONGR_PR_K });
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const network = getCurrentNetwork(Coins.COINS.TRX);
            return `${network === Coins.COINS.TRX.mainnet ? "api" : "nile"}.trongrid.io/wallet/triggerconstantcontract`;
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
            return BigNumber.from(`0x${balanceHex}`).toString();
        } catch (e) {
            improveAndRethrow(e, "trongridTrc20BalanceProvider.getDataByResponse");
        }
    }
}
export class Trc20BalanceProvider {
    static _provider = new CachedRobustExternalApiCallerService(
        "trc20BalanceProvider",
        [new TrongridTrc20BalanceProvider()],
        120000,
        130,
        1000,
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
