import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { TronBlockchainBalancesProvider } from "../external-apis/tronBlockchainBalancesProvider";
import { TrxAddressesService } from "./trxAddressesService";
import { Trc20BalanceProvider } from "../../trc20token/external-apis/trc20BalanceProvider";
import { TronBalanceProvider } from "../external-apis/tronBalanceProvider";
import { Coins } from "../../coins";

export class TronBlockchainBalancesService {
    /**
     * Retrieves balance for given coin in trx blockchain.
     * This method uses 3 providers. First one retrieves all balances by singly request for trx and tokens and fills caches.
     * If it fails we try per-coin providers retrieving just what we ask from them.
     *
     * @param coin {Coin} coin to get balance for
     * @returns {Promise<string>} balance string in coin (not atoms)
     */
    static async getBalance(coin) {
        try {
            let result;
            const address = TrxAddressesService.getCurrentTrxAddress();
            try {
                const balances = await TronBlockchainBalancesProvider.getTronBlockchainBalances(address);
                const isValidResult = balances.find(item => item?.ticker === Coins.COINS.TRX.ticker);
                if (!isValidResult) {
                    throw new Error("Trying another retrieval method.");
                }
                const balanceData = (balances ?? []).find(item => item.ticker === coin.ticker);
                result = balanceData?.balance ?? "0";
            } catch (e) {
                if (coin.tokenAddress) {
                    result = await Trc20BalanceProvider.getTrc20Balance(coin, address);
                } else {
                    result = await TronBalanceProvider.getTronBalance(address);
                }
            }
            if (result == null || typeof result !== "string" || !result.match(/^\d+$/)) {
                throw new Error(`Balance for ${coin.ticker} has wrong format or just not retrieved: ${result}`);
            }

            return coin.atomsToCoinAmount(result);
        } catch (e) {
            improveAndRethrow(e, "tronBlockchainBalancesService.getBalance");
        }
    }

    /**
     * Retrieves available bandwidth and energy for current tron account.
     *
     * @return {Promise<{availableBandwidth: number, availableEnergy: number}>}
     */
    static async getTronAccountResources() {
        try {
            const address = TrxAddressesService.getCurrentTrxAddress();
            const data = await TronBlockchainBalancesProvider.getTronBlockchainBalances(address);
            const resources = data.find(item => item?.availableBandwidth != null && item?.availableEnergy != null);
            return {
                availableBandwidth: resources?.availableBandwidth ?? 0,
                availableEnergy: resources?.availableEnergy ?? 0,
            };
        } catch (e) {
            improveAndRethrow(e, "getTronAccountResources");
        }
    }

    /**
     * @return {Promise<Coin[]>}
     */
    static async getTronOrTrc20TokensHavingNotZeroBalance() {
        try {
            const address = TrxAddressesService.getCurrentTrxAddress();
            const data = await TronBlockchainBalancesProvider.getTronBlockchainBalances(address);
            return data
                .filter(item => item.balance != null && item.balance !== "0")
                .map(item => Coins.getCoinByTicker(item.ticker));
        } catch (e) {
            improveAndRethrow(e, "");
        }
    }

    static markBalancesAsExpired(coin) {
        try {
            const address = TrxAddressesService.getCurrentTrxAddress();
            TronBlockchainBalancesProvider.markTronBlockchainBalancesAsExpiredButDontRemove(address);
            if (coin === Coins.COINS.TRX) {
                TronBalanceProvider.markTronBalanceAsExpiredButDontRemove(address);
            } else {
                Trc20BalanceProvider.markTrc20BalanceCacheAsExpired(coin, address);
            }
        } catch (e) {
            improveAndRethrow(e, "markBalancesAsExpired");
        }
    }

    static actualizeBalanceCacheWithAmountAtomsForCoin(coin, valuesAtoms, sign) {
        try {
            const address = TrxAddressesService.getCurrentTrxAddress();
            TronBlockchainBalancesProvider.actualizeBalanceCacheWithAmount(address, coin, valuesAtoms, sign);
            if (coin === Coins.COINS.TRX) {
                TronBalanceProvider.actualizeBalanceCacheWithAmount(address, valuesAtoms, sign);
            } else {
                Trc20BalanceProvider.actualizeBalanceCacheWithAmount(address, coin, valuesAtoms, sign);
            }
        } catch (e) {
            improveAndRethrow(e, "actualizeBalanceCacheWithJustSentTransaction");
        }
    }
}
