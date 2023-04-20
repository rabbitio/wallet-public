import { improveAndRethrow } from "../../common/utils/errorUtils";
import { Coins } from "../coins";
import { tronWallet } from "../trx/tronWallet";
import { ethereumWallet } from "../eth/ethereumWallet";
import { bitcoinWallet } from "../btc/bitcoinWallet";
import { Erc20TokenWallet } from "../erc20token/models/erc20TokenWallet";
import { Coin } from "./models/coin";
import { Trc20TokenWallet } from "../trc20token/models/trc20TokenWallet";

export class Wallets {
    static _WALLETS = [
        bitcoinWallet,
        ethereumWallet,
        tronWallet,
        ...Coins.getCoinsListByProtocol(Coin.PROTOCOLS.ERC20).map(erc20Token => new Erc20TokenWallet(erc20Token)),
        ...Coins.getCoinsListByProtocol(Coin.PROTOCOLS.TRC20).map(trc20Token => new Trc20TokenWallet(trc20Token)),
    ];

    static getWalletsForAllEnabledCoins() {
        try {
            const enabledCoins = Coins.getEnabledCoinsList() ?? [];
            return this._WALLETS.filter(w => enabledCoins.find(c => c === w.coin));
        } catch (e) {
            improveAndRethrow(e, "getWalletsForAllEnabledCoins");
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
                throw new Error("No wallet for coin: " + coin.ticker);
            }

            return wallet;
        } catch (e) {
            improveAndRethrow(e, "getWalletByCoin");
        }
    }
}
