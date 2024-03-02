import { improveAndRethrow } from "@rabbitio/ui-kit";

import { Storage } from "../common/services/internal/storage.js";
import { bitcoin } from "./btc/bitcoin.js";
import { ethereum } from "./eth/ethereum.js";
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
} from "./erc20token/tokens/erc20tokens.js";
import {
    bttTrc20,
    jstTrc20,
    sunTrc20,
    tusdTrc20,
    usdcTrc20,
    usddTrc20,
    usdtTrc20,
    wtrxTrc20,
} from "./trc20token/tokens/trc20tokens.js";
import { tron } from "./trx/tron.js";
import { PreferencesService } from "./common/services/preferencesService.js";
import { UserDataAndSettings } from "./common/models/userDataAndSettings.js";
import { TickersAdapter } from "./common/external-apis/utils/tickersAdapter.js";

/**
 * This is the main service to manage coins.
 * You should access coins singletons via this service.
 * Coin objects are being compared by references to singletons all over the app so use only singletons
 * and never instantiate Coin or its descendants manually.
 *
 * TODO: [refactoring, high] rename to CoinsService
 */
export class Coins {
    /**
     * Use this mapping object to address exact coin like Coins.COIN.BTC.
     * Keys here are not guarantied to be tickers. Use getCoinByTicker to get coin by ticker.
     * @type {Coin[]}
     */
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
     * @param coinsToEnable {Coin[]}
     * @return {Promise<boolean>} true if the coin was disabled and we enabled it during this call and false otherwise
     */
    static async enableCoinsIfDisabled(coinsToEnable) {
        try {
            const enabledTickersCommaSeparated =
                PreferencesService.getUserSettingValue(UserDataAndSettings.SETTINGS.ENABLED_COINS_LIST) ??
                this.getDefaultEnabledCoinsList().reduce((prev, current) => {
                    return prev.length ? prev + "," + current.ticker : current.ticker;
                }, "");
            const enabledTickers = enabledTickersCommaSeparated.split(",");
            const notEnabledList = coinsToEnable.filter(c => !enabledTickers.find(t => t === c.ticker));
            if (notEnabledList.length) {
                const tickersToAddCommaSeparated = notEnabledList.map(c => c.ticker).join(",");
                const tickersCommaSeparated =
                    enabledTickersCommaSeparated !== ""
                        ? `${enabledTickersCommaSeparated},${tickersToAddCommaSeparated}`
                        : tickersToAddCommaSeparated;
                await PreferencesService.cacheAndSaveSetting(
                    UserDataAndSettings.SETTINGS.ENABLED_COINS_LIST,
                    tickersCommaSeparated
                );
                return true;
            }
            return false;
        } catch (e) {
            improveAndRethrow(e, "enableCoinsIfDisabled");
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
        return Object.keys(this.COINS).map(key => Storage.getCurrentNetwork(this.COINS[key]));
    }

    /**
     * Returns unique networks for all coins. Choose current network (according to app configuration - main or test).
     * Distinction is made by coin id and network key.
     * @return {Network[]}
     */
    static getUniqueSupportedNetworks() {
        try {
            const allNetworks = Object.keys(this.COINS).map(key => Storage.getCurrentNetwork(this.COINS[key]));
            const uniqueNetworksByCoinId = [];
            for (let i = 0; i < allNetworks.length; ++i) {
                if (
                    !uniqueNetworksByCoinId.find(
                        net => net.coinIndex === allNetworks[i].coinIndex && net.key === allNetworks[i].key
                    )
                ) {
                    uniqueNetworksByCoinId.push(allNetworks[i]);
                }
            }
            return uniqueNetworksByCoinId;
        } catch (e) {
            improveAndRethrow(e, "getUniqueSupportedNetworks");
        }
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

    /**
     * Returns coin by rabbit ticker format or null.
     *
     * @param ticker {string} ticker string
     * @return {Coin|null} coin corresponding to given ticker or null
     */
    static getCoinByTickerIfPresent(ticker) {
        try {
            return Object.values(this.COINS).find(coin => coin.ticker === (ticker ?? "").toUpperCase()) ?? null;
        } catch (e) {
            improveAndRethrow(e, "getCoinByTickerIfPresent");
        }
    }

    /**
     * Returns coins by given standardTicker if it is supported.
     *
     * @param standardTicker {string} standardTicker string
     * @return {Coin[]} coins corresponding to given standardTicker or null
     */
    static getCoinsIfStandardTickerIsSupported(standardTicker) {
        try {
            const coins = Object.values(this.COINS).filter(
                coin =>
                    TickersAdapter.rabbitTickerToStandardTicker(coin.ticker, coin.protocol) ===
                    (standardTicker ?? "").toUpperCase()
            );
            return coins;
        } catch (e) {
            improveAndRethrow(e, "getCoinsIfStandardTickerIsSupported");
        }
    }

    /**
     * @param address {string}
     * @return {Coin|null}
     */
    static getCoinByContractAddress(address) {
        try {
            const coin = Object.values(this.COINS).find(
                coin =>
                    coin.tokenAddress === (coin?.doesUseLowerCaseAddresses ? (address ?? "").toLowerCase() : address)
            );
            return coin ?? null;
        } catch (e) {
            improveAndRethrow(e, "getCoinByContractAddress");
        }
    }

    static tickerAndProtocol(coin) {
        try {
            return `${coin.tickerPrintable}${coin.protocol ? " " + coin.protocol.protocol : ""}`;
        } catch (e) {
            improveAndRethrow(e, "tickerAndProtocol");
        }
    }
}
