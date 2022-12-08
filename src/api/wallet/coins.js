import { getCurrentNetwork } from "../common/services/internal/storage";
import { improveAndRethrow } from "../common/utils/errorUtils";
import { bitcoin } from "./btc/bitcoin";
import { ethereum } from "./eth/ethereum";
import { usdtErc20 } from "./erc20token/tokens/usdtErc20";

export class Coins {
    static COINS = {
        BTC: bitcoin,
        ETH: ethereum,
        USDTERC20: usdtErc20,
    };

    // Static initializer. Cannot use static {} as safari still doesn't support it
    static initializer = (() => this.COINS.USDTERC20.setFeeCoin(this.COINS.ETH) && true)();

    static getSupportedCoinsList() {
        return Object.keys(this.COINS).map(ticker => this.COINS[ticker]);
    }

    static getSupportedCoinsTickers() {
        return Object.keys(this.COINS);
    }

    /**
     * Returns networks for all coins. Choose current network (according to app configuration - main or test)
     * @return {Network[]}
     */
    static getSupportedNetworks() {
        return Object.keys(this.COINS).map(ticker => getCurrentNetwork(this.COINS[ticker]));
    }

    /**
     * Returns coin by given ticker
     *
     * @param ticker
     * @return {Coin}
     * @throws Error if there is no coin for given ticker
     */
    static getCoinByTicker(ticker) {
        try {
            if (this.COINS.hasOwnProperty(ticker.toUpperCase())) {
                return this.COINS[ticker.toUpperCase()];
            }

            throw new Error("No coin for given ticker " + ticker);
        } catch (e) {
            improveAndRethrow(e, "getCoinByTicker");
        }
    }
}
