import { improveAndRethrow } from "../../common/utils/errorUtils";
import { Coins } from "../coins";
import { tronWallet } from "../trx/tronWallet";
import { ethereumWallet } from "../eth/ethereumWallet";
import { bitcoinWallet } from "../btc/bitcoinWallet";
import { Erc20TokenWallet } from "../erc20token/models/erc20TokenWallet";
import { Trc20TokenWallet } from "../trc20token/models/trc20TokenWallet";
import { TRC20 } from "../trc20token/trc20Protocol";
import { ERC20 } from "../erc20token/erc20Protocol";

/**
 * This is the main service to manage wallets.
 * You should access wallet singletons via this service.
 * Wallet objects are being compared by references to singletons all over the app so use only singletons
 * and never instantiate Wallet or its descendants manually.
 */
export class Wallets {
    static _WALLETS = [
        bitcoinWallet,
        ethereumWallet,
        tronWallet,
        ...Coins.getCoinsListByProtocol(ERC20).map(erc20Token => new Erc20TokenWallet(erc20Token)),
        ...Coins.getCoinsListByProtocol(TRC20).map(trc20Token => new Trc20TokenWallet(trc20Token)),
    ];

    /**
     * @return {Wallet[]}
     */
    static getWalletsForAllEnabledCoins() {
        try {
            const enabledCoins = Coins.getEnabledCoinsList() ?? [];
            return this._WALLETS.filter(w => enabledCoins.find(c => c === w.coin));
        } catch (e) {
            improveAndRethrow(e, "getWalletsForAllEnabledCoins");
        }
    }

    /**
     * @return {Wallet[]}
     */
    static getWalletsForAllSupportedCoins() {
        try {
            const supportedCoins = Coins.getSupportedCoinsList() ?? [];
            return this._WALLETS.filter(w => supportedCoins.find(c => c === w.coin));
        } catch (e) {
            improveAndRethrow(e, "getWalletsForAllSupportedCoins");
        }
    }

    /**
     * Returns the wallet corresponding to given coin
     *
     * @param coin {Coin} coin to get wallet for
     * @return {Wallet|null} wallet
     * @throws {Error} if there is no wallet for given coin
     */
    static getWalletByCoin(coin) {
        try {
            const wallet = this._WALLETS.find(wallet => wallet.coin === coin);
            if (!wallet) {
                throw new Error("No wallet for coin: " + coin?.ticker);
            }

            return wallet;
        } catch (e) {
            improveAndRethrow(e, "getWalletByCoin");
        }
    }

    /**
     * @param coins {Coin[]}
     * @return {Wallet[]}
     * @throws {Error} if any coin is not supported
     */
    static getWalletsByCoins(coins) {
        try {
            return coins.map(coin => this.getWalletByCoin(coin));
        } catch (e) {
            improveAndRethrow(e, "getWalletsByCoins");
        }
    }
}
