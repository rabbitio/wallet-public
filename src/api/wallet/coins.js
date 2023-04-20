import { getCurrentNetwork } from "../common/services/internal/storage";
import { improveAndRethrow } from "../common/utils/errorUtils";
import { bitcoin } from "./btc/bitcoin";
import { ethereum } from "./eth/ethereum";
import {
    agixErc20,
    blurErc20,
    busdErc20,
    daiErc20,
    ftmErc20,
    galaErc20,
    grtErc20,
    linkErc20,
    maskErc20,
    maticErc20,
    _1InchErc20,
    sandErc20,
    qntErc20,
    shibErc20,
    tusdErc20,
    usdcErc20,
    usdtErc20,
    wBtcErc20,
    flokiErc20,
    hexErc20,
    uniErc20,
    fetErc20,
    snxErc20,
    sushiErc20,
    ldoErc20,
    apeErc20,
    imxErc20,
    rndrErc20,
    yfiErc20,
    cvxErc20,
    stethErc20,
    paxgErc20,
    syncErc20,
    fxsErc20,
    lptErc20,
    balErc20,
    vraErc20,
    stgErc20,
    lrcErc20,
} from "./erc20token/tokens/erc20tokens";
import {
    bttTrc20,
    jstTrc20,
    sunTrc20,
    tusdTrc20,
    usdcTrc20,
    usddTrc20,
    usdtTrc20,
    wtrxTrc20,
} from "./trc20token/tokens/trc20tokens";
import { tron } from "./trx/tron";
import { PreferencesService } from "./common/services/preferencesService";
import { UserDataAndSettings } from "./common/models/userDataAndSettings";

export class Coins {
    static COINS = {
        BTC: bitcoin,
        ETH: ethereum,
        TRX: tron,
        USDTERC20: usdtErc20,
        USDTTRC20: usdtTrc20,
        USDCERC20: usdcErc20,
        USDCTRC20: usdcTrc20,
        SHIBERC20: shibErc20,
        BUSDERC20: busdErc20,
        FTMERC20: ftmErc20,
        MATICERC20: maticErc20,
        GALAERC20: galaErc20,
        LINKERC20: linkErc20,
        AGIXERC20: agixErc20,
        DAIERC20: daiErc20,
        SANDERC20: sandErc20,
        WBTCERC20: wBtcErc20,
        BLURERC20: blurErc20,
        GRTERC20: grtErc20,
        MASKERC20: maskErc20,
        TUSDERC20: tusdErc20,
        TUSDTRC20: tusdTrc20,
        _1INCHERC20: _1InchErc20,
        QNTERC20: qntErc20,
        FLOKIERC20: flokiErc20,
        HEXERC20: hexErc20,
        UNIERC20: uniErc20,
        FETERC20: fetErc20,
        SNXERC20: snxErc20,
        SUSHIERC20: sushiErc20,
        LDOERC20: ldoErc20,
        APEERC20: apeErc20,
        IMXERC20: imxErc20,
        RNDRERC20: rndrErc20,
        JSTTRC20: jstTrc20,
        YFIERC20: yfiErc20,
        SUNTRC20: sunTrc20,
        BTTTRC20: bttTrc20,
        USDDTRC20: usddTrc20,
        CVXERC20: cvxErc20,
        STETHERC20: stethErc20,
        PAXGERC20: paxgErc20,
        SYNERC20: syncErc20,
        FXSERC20: fxsErc20,
        LPTERC20: lptErc20,
        BALERC20: balErc20,
        VRAERC20: vraErc20,
        WTRXTRC20: wtrxTrc20,
        STGERC20: stgErc20,
        LRCERC20: lrcErc20,
    };

    static _tickers = Object.keys(this.COINS).map(key => this.COINS[key].ticker);

    /**
     * Retrieves technically supported coins list. Each coin is singleton.
     * Note that customer can use only few coins and there is another API to get enabled coins.
     *
     * @return {Coin[]}
     */
    static getSupportedCoinsList() {
        return Object.values(this.COINS);
    }

    static getDefaultEnabledCoinsList() {
        const walletCreationTimestamp = PreferencesService.getWalletCreationTime();
        const release0_8_0Timestamp = 1681990200000; // GMT 20.04.2023 11:30
        if (walletCreationTimestamp != null && walletCreationTimestamp < release0_8_0Timestamp) {
            return [this.COINS.BTC, this.COINS.ETH, this.COINS.USDTERC20];
        }
        return [this.COINS.BTC, this.COINS.ETH, this.COINS.SHIBERC20];
    }

    /**
     * Retrieves enabled coins list. Enabled coins are ones that are currently used by customer.
     * Not like supported coins what are the whole coins list that is technically supported in Rabbit.
     *
     * @return {Coin[]}
     */
    static getEnabledCoinsList() {
        try {
            const tickersString = PreferencesService.getUserSettingValue(
                UserDataAndSettings.SETTINGS.ENABLED_COINS_LIST
            );
            if (tickersString == null) {
                return this.getDefaultEnabledCoinsList();
            }
            if (tickersString === "") {
                return [];
            }
            const coins = Object.values(this.COINS);
            return tickersString
                .split(",")
                .filter(ticker => ticker !== "")
                .map(ticker => coins.find(coin => coin.ticker === ticker));
        } catch (e) {
            improveAndRethrow(e, "getEnabledCoinsList");
        }
    }

    /**
     * @param coins {Coin[]} coins set that only should be enabled
     * @return {Promise<void>}
     */
    static async setCurrentEnabledCoins(coins) {
        try {
            const tickersCommaSeparated = coins.map(c => c.ticker).join(",");
            await PreferencesService.cacheAndSaveSetting(
                UserDataAndSettings.SETTINGS.ENABLED_COINS_LIST,
                tickersCommaSeparated
            );
        } catch (e) {
            improveAndRethrow(e, "setCurrentEnabledCoins");
        }
    }

    /**
     * @param coin {Coin}
     * @return {Promise<boolean>} true if the coin was disabled and we enabled it during this call and false otherwise
     */
    static async enableCoinIfDisabled(coin) {
        try {
            const enabledTickersCommaSeparated =
                PreferencesService.getUserSettingValue(UserDataAndSettings.SETTINGS.ENABLED_COINS_LIST) ??
                this.getDefaultEnabledCoinsList().reduce((prev, current) => {
                    return prev.length ? prev + "," + current.ticker : current.ticker;
                }, "");
            const isEnabled = enabledTickersCommaSeparated.split(",").find(t => t === coin.ticker);
            if (!isEnabled) {
                const tickersCommaSeparated =
                    enabledTickersCommaSeparated !== ""
                        ? `${enabledTickersCommaSeparated},${coin.ticker}`
                        : coin.ticker;
                await PreferencesService.cacheAndSaveSetting(
                    UserDataAndSettings.SETTINGS.ENABLED_COINS_LIST,
                    tickersCommaSeparated
                );
                return true;
            }
            return false;
        } catch (e) {
            improveAndRethrow(e, "enableCoinIfDisabled");
        }
    }

    static getSupportedCoinsTickers() {
        return this._tickers;
    }

    static getEnabledCoinsTickers() {
        try {
            const enabledTickers = PreferencesService.getUserSettingValue(
                UserDataAndSettings.SETTINGS.ENABLED_COINS_LIST
            );
            if (enabledTickers === "") {
                return [];
            }
            if (enabledTickers == null) {
                return this.getDefaultEnabledCoinsList().map(coin => coin.ticker);
            }
            return enabledTickers.split(",").filter(ticker => ticker !== "");
        } catch (e) {
            improveAndRethrow(e, "getEnabledCoinsTickers");
        }
    }

    /**
     * Returns networks for all coins. Choose current network (according to app configuration - main or test)
     * @return {Network[]}
     */
    static getSupportedNetworks() {
        return Object.keys(this.COINS).map(key => getCurrentNetwork(this.COINS[key]));
    }

    /**
     * @param protocol {Protocol}
     * @return {Coin[]}
     */
    static getCoinsListByProtocol(protocol) {
        try {
            return Object.values(this.COINS).filter(coin => coin.protocol === protocol);
        } catch (e) {
            improveAndRethrow(e, "getCoinsListByProtocol");
        }
    }

    /**
     * Returns coin by given ticker
     *
     * @param ticker {string} ticker string
     * @return {Coin} coin corresponding to given ticker
     * @throws Error if there is no coin for given ticker
     */
    static getCoinByTicker(ticker) {
        try {
            const coin = Object.values(this.COINS).find(coin => coin.ticker === (ticker ?? "").toUpperCase());
            if (coin) {
                return coin;
            }

            throw new Error("No coin for given ticker " + ticker);
        } catch (e) {
            improveAndRethrow(e, "getCoinByTicker");
        }
    }
}
