import { improveAndRethrow } from "../../common/utils/errorUtils";
import { bitcoinWallet } from "../btc/bitcoinWallet";
import { ethereumWallet } from "../eth/ethereumWallet";
import { usdtErc20Wallet } from "../erc20token/tokens/usdtErc20Wallet";

export class Wallets {
    static _WALLETS = [bitcoinWallet, ethereumWallet, usdtErc20Wallet];

    static getWalletsForAllSupportedCoins() {
        return this._WALLETS;
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
