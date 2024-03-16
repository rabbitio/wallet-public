import { improveAndRethrow, Logger } from "@rabbitio/ui-kit";

import { EthAddressesService } from "../../eth/services/ethAddressesService.js";
import { Erc20AllBalancesProvider } from "../external-apis/erc20AllBalancesProvider.js";
import { Erc20SingleBalanceProvider } from "../external-apis/erc20SingleBalanceProvider.js";
import { Coins } from "../../coins.js";

export class Erc20TokenBalanceService {
    /**
     * Retrieves token's balance
     *
     * @param coin {Coin} token to get balance for
     * @returns {Promise<string>} balance string in token's atoms
     * @throws {Error} if fails to find balance for given token
     */
    static async calculateBalance(coin) {
        try {
            const address = EthAddressesService.getCurrentEthAddress();
            let balances = null;
            try {
                balances = await Erc20AllBalancesProvider.getErc20Balances(address);
            } catch (e) {
                Logger.logError(e, "Erc20TokenBalanceService.calculateBalance", "Failed to get erc20 batch balances");
            }
            let balance;
            if (balances != null) {
                balance = balances.find(b => b.ticker === coin.ticker)?.balance;
                if (balance == null) {
                    /*
                     * If multi coin provider doesn't fail but its result has no specific erc20 coin balance
                     * it means that the balance of this coin is 0.
                     */
                    balance = "0";
                }
            } else {
                balance = await Erc20SingleBalanceProvider.getErc20TokenBalance(address, coin);
                balance != null && Erc20AllBalancesProvider.addErc20BalanceToCache(coin, address, balance);
            }
            if (balance == null) {
                throw new Error(`Failed to get balance for coin from several providers: ${coin.ticker}`);
            }
            const balanceCoins = coin.atomsToCoinAmount(balance);
            Logger.log(`Balance for ${coin.ticker} ${balanceCoins}`, "calculateBalance");

            return balanceCoins;
        } catch (e) {
            improveAndRethrow(e, "calculateBalance");
        }
    }

    static async getSupportedErc20TokensHavingNonZeroBalance() {
        try {
            const address = EthAddressesService.getCurrentEthAddress();
            const balances = await Erc20AllBalancesProvider.getErc20Balances(address);
            return balances.filter(item => item.balance !== "0").map(item => Coins.getCoinByTicker(item.ticker));
        } catch (e) {
            improveAndRethrow(e, "getSupportedErc20TokensHavingNonZeroBalance");
        }
    }

    static markErc20TokenBalanceAsExpired(token) {
        try {
            const address = EthAddressesService.getCurrentEthAddress();
            Erc20AllBalancesProvider.markErc20BalancesAsExpired(address);
            Erc20SingleBalanceProvider.markErc20BalanceAsExpired(token, address);
        } catch (e) {
            improveAndRethrow(e, "markErc20TokenBalanceAsExpired");
        }
    }

    static actualizeBalanceCacheWithAmountAtoms(coin, amountAtoms, sign) {
        try {
            const address = EthAddressesService.getCurrentEthAddress();
            Erc20AllBalancesProvider.actualizeBalanceCacheWithAmountAtoms(coin, address, amountAtoms, sign);
            Erc20SingleBalanceProvider.actualizeBalanceCacheWithAmountAtoms(coin, address, amountAtoms, sign);
        } catch (e) {
            improveAndRethrow(e, "actualizeBalanceCacheWithAmountAtoms");
        }
    }
}
