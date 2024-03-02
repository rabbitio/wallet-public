import { improveAndRethrow } from "@rabbitio/ui-kit";

import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService.js";
import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider.js";
import { Storage } from "../../../common/services/internal/storage.js";
import { Coins } from "../../coins.js";
import { TickersAdapter } from "../../common/external-apis/utils/tickersAdapter.js";
import { ApiGroups } from "../../../common/external-apis/apiGroups.js";
import {
    createRawBalanceAtomsCacheProcessorForMultiBalancesProvider,
    mergeTwoBalancesArraysAndNotifyAboutBalanceValueChange,
} from "../../common/utils/cacheActualizationUtils.js";
import { STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS } from "../../../common/utils/ttlConstants.js";
import { TRC20 } from "../../trc20token/trc20Protocol.js";

class TronscanBlockchainBalanceProvider extends ExternalApiProvider {
    constructor() {
        super("https://apilist.tronscan.org/api/account", "get", 15000, ApiGroups.TRONSCAN);
    }

    composeQueryString(params, subRequestIndex = 0) {
        if (Storage.getCurrentNetwork(Coins.COINS.TRX) !== Coins.COINS.TRX.mainnet) {
            throw new Error("Tronscan provider doesn't support testnet for balances retrieval.");
        }
        return `?address=${params[0]}`;
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            const data = response?.data;
            const trxBalance = "" + data?.balance;
            const tokenAddresses = Coins.getSupportedCoinsList()
                .filter(c => c.protocol === TRC20)
                .map(t => t.tokenAddress);
            const trc20Balances = (data?.trc20token_balances ?? [])
                .filter(t => tokenAddresses.find(a => a.toLowerCase() === t.tokenId.toLowerCase()))
                .map(item => ({
                    balance: "" + item?.balance,
                    ticker: TickersAdapter.standardTickerToRabbitTicker(item?.tokenAbbr, TRC20.protocol),
                }));
            const resources = {
                availableBandwidth: (data?.bandwidth?.freeNetRemaining ?? 0) + (data?.bandwidth?.netRemaining ?? 0),
                availableEnergy: data?.bandwidth?.energyRemaining ?? 0,
            };
            return [{ balance: trxBalance, ticker: Coins.COINS.TRX.ticker }, ...trc20Balances, resources];
        } catch (e) {
            improveAndRethrow(e, "tronscanBlockchainBalanceProvider.getDataByResponse");
        }
    }
}

export class TronBlockchainBalancesProvider {
    static _provider = new CachedRobustExternalApiCallerService(
        "tronBlockchainBalanceProvider",
        [new TronscanBlockchainBalanceProvider()],
        STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS,
        false,
        mergeTwoBalancesArraysAndNotifyAboutBalanceValueChange
    );

    /**
     * Retrieves balances for trx and trc20 tokens and remaining resources (bandwidth and energy)
     *
     * @param accountAddress {string} address of the account to get balance for
     * @returns {Promise<Array<{ ticker: string, balance: string }|{ availableBandwidth: number, availableEnergy: number }>>}
     */
    static async getTronBlockchainBalances(accountAddress) {
        try {
            return await this._provider.callExternalAPICached(
                [accountAddress],
                15000,
                null,
                1,
                customHashFunctionForParams
            );
        } catch (e) {
            improveAndRethrow(e, "getTronBlockchainBalances");
        }
    }

    static markTronBlockchainBalancesAsExpiredButDontRemove(address) {
        this._provider.markCacheAsExpiredButDontRemove([address], customHashFunctionForParams);
    }

    static actualizeBalanceCacheWithAmount(address, coin, valuesAtoms, sign) {
        try {
            const cacheProcessor = createRawBalanceAtomsCacheProcessorForMultiBalancesProvider(coin, valuesAtoms, sign);
            this._provider.actualizeCachedData([address], cacheProcessor, customHashFunctionForParams);
        } catch (e) {
            improveAndRethrow(e, "actualizeBalanceCacheWithAmount");
        }
    }
}

const customHashFunctionForParams = params => `all_tron_blockchain_balances_${params[0]}`;
