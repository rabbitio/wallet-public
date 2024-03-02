import { improveAndRethrow } from "@rabbitio/ui-kit";

import { ApiGroups } from "../../../common/external-apis/apiGroups.js";
import { Coins } from "../../coins.js";

// TODO: [refactoring, low] improve architecture of ApiGroups and their adapters
export class ApiGroupCoinIdAdapters {
    /**
     * @param apiGroup {ApiGroup}
     * @param coins {Coin[]}
     */
    static getCoinIdsListByCoinsListForApiGroup(apiGroup, coins) {
        try {
            let result = [];
            switch (apiGroup) {
                case ApiGroups.COINCAP:
                    result = coinsToCoincapIds(coins);
                    break;
                case ApiGroups.COINGECKO:
                    result = coinsToCoingeckoIds(coins);
                    break;
                case ApiGroups.MESSARI:
                    result = coinsToMessariIds(coins);
                    break;
                default:
                    throw new Error("Given API group is not supported by coin id adapter.: " + apiGroup.id);
            }
            return result;
        } catch (e) {
            improveAndRethrow(e, "getCoinIdsListByCoinsListForApiGroup");
        }
    }
}

function coinsToCoincapIds(coins) {
    return coins.map(coin => {
        let coinIdClearForProvider = null;
        switch (coin.ticker) {
            case Coins.COINS.BTC.ticker:
                coinIdClearForProvider = "bitcoin";
                break;
            case Coins.COINS.ETH.ticker:
                coinIdClearForProvider = "ethereum";
                break;
            case Coins.COINS.USDTERC20.ticker:
                coinIdClearForProvider = "tether";
                break;
            case Coins.COINS.TRX.ticker:
                coinIdClearForProvider = "tron";
                break;
            case Coins.COINS.USDTTRC20.ticker:
                coinIdClearForProvider = "tether";
                break;
            case Coins.COINS.USDCERC20.ticker:
                coinIdClearForProvider = "usd-coin";
                break;
            case Coins.COINS.USDCTRC20.ticker:
                coinIdClearForProvider = "usd-coin";
                break;
            case Coins.COINS.SHIBERC20.ticker:
                coinIdClearForProvider = "shiba-inu";
                break;
            case Coins.COINS.BUSDERC20.ticker:
                coinIdClearForProvider = "binance-usd";
                break;
            case Coins.COINS.FTMERC20.ticker:
                coinIdClearForProvider = "fantom";
                break;
            case Coins.COINS.MATICERC20.ticker:
                coinIdClearForProvider = "polygon";
                break;
            // Doesn't support GALA
            case Coins.COINS.LINKERC20.ticker:
                coinIdClearForProvider = "chainlink";
                break;
            // Doesn't support AGIX
            case Coins.COINS.DAIERC20.ticker:
                coinIdClearForProvider = "multi-collateral-dai";
                break;
            case Coins.COINS.SANDERC20.ticker:
                coinIdClearForProvider = "the-sandbox";
                break;
            case Coins.COINS.WBTCERC20.ticker:
                coinIdClearForProvider = "wrapped-bitcoin";
                break;
            // Doesn't support BLUR
            case Coins.COINS.GRTERC20.ticker:
                coinIdClearForProvider = "the-graph";
                break;
            case Coins.COINS.MASKERC20.ticker:
                coinIdClearForProvider = "mask-network";
                break;
            case Coins.COINS.TUSDERC20.ticker:
                coinIdClearForProvider = "trueusd";
                break;
            case Coins.COINS.TUSDTRC20.ticker:
                coinIdClearForProvider = "trueusd";
                break;
            case Coins.COINS._1INCHERC20.ticker:
                coinIdClearForProvider = "1inch";
                break;
            case Coins.COINS.QNTERC20.ticker:
                coinIdClearForProvider = "quant";
                break;
            // Doesn't support FLOKI
            // Doesn't support HEX
            case Coins.COINS.UNIERC20.ticker:
                coinIdClearForProvider = "uniswap";
                break;
            // Doesn't support FET
            case Coins.COINS.SNXERC20.ticker:
                coinIdClearForProvider = "synthetix-network-token";
                break;
            // Doesn't support SUSHI
            case Coins.COINS.LDOERC20.ticker:
                coinIdClearForProvider = "lido-dao";
                break;
            // Doesn't support APE
            // Doesn't support IMX
            case Coins.COINS.RNDRERC20.ticker:
                coinIdClearForProvider = "render-token";
                break;
            // Doesn't support JST
            case Coins.COINS.YFIERC20.ticker:
                coinIdClearForProvider = "yearn-finance";
                break;
            // Doesn't support SUN
            // Doesn't support BTT
            // Doesn't support USDD
            case Coins.COINS.CVXERC20.ticker:
                coinIdClearForProvider = "convex-finance";
                break;
            // Doesn't support stETH
            // Doesn't support PAXG
            // Doesn't support SYN
            case Coins.COINS.FXSERC20.ticker:
                coinIdClearForProvider = "frax-share";
                break;
            // Doesn't support LPT
            case Coins.COINS.BALERC20.ticker:
                coinIdClearForProvider = "balancer";
                break;
            // Doesn't support VRA
            // Doesn't support WTRX
            // Doesn't support STG
            case Coins.COINS.LRCERC20.ticker:
                coinIdClearForProvider = "loopring";
                break;
            default:
                throw new Error("Add support for the coin to coincap coin-usd rates provider: " + coin.ticker);
        }

        return coinIdClearForProvider;
    });
}

function coinsToCoingeckoIds(coins) {
    return coins.map(coin => {
        let coinIdClearForProvider = null;
        switch (coin.ticker) {
            case Coins.COINS.BTC.ticker:
                coinIdClearForProvider = "bitcoin";
                break;
            case Coins.COINS.ETH.ticker:
                coinIdClearForProvider = "ethereum";
                break;
            case Coins.COINS.USDTERC20.ticker:
                coinIdClearForProvider = "tether";
                break;
            case Coins.COINS.TRX.ticker:
                coinIdClearForProvider = "tron";
                break;
            case Coins.COINS.USDTTRC20.ticker:
                coinIdClearForProvider = "tether";
                break;
            case Coins.COINS.USDCERC20.ticker:
                coinIdClearForProvider = "usd-coin";
                break;
            case Coins.COINS.USDCTRC20.ticker:
                coinIdClearForProvider = "usd-coin";
                break;
            case Coins.COINS.SHIBERC20.ticker:
                coinIdClearForProvider = "shiba-inu";
                break;
            case Coins.COINS.BUSDERC20.ticker:
                coinIdClearForProvider = "binance-usd";
                break;
            case Coins.COINS.FTMERC20.ticker:
                coinIdClearForProvider = "fantom";
                break;
            case Coins.COINS.MATICERC20.ticker:
                coinIdClearForProvider = "matic-network";
                break;
            case Coins.COINS.GALAERC20.ticker:
                coinIdClearForProvider = "gala";
                break;
            case Coins.COINS.LINKERC20.ticker:
                coinIdClearForProvider = "chainlink";
                break;
            case Coins.COINS.AGIXERC20.ticker:
                coinIdClearForProvider = "singularitynet";
                break;
            case Coins.COINS.DAIERC20.ticker:
                coinIdClearForProvider = "dai";
                break;
            case Coins.COINS.SANDERC20.ticker:
                coinIdClearForProvider = "the-sandbox";
                break;
            case Coins.COINS.WBTCERC20.ticker:
                coinIdClearForProvider = "wrapped-bitcoin";
                break;
            case Coins.COINS.BLURERC20.ticker:
                coinIdClearForProvider = "blur";
                break;
            case Coins.COINS.GRTERC20.ticker:
                coinIdClearForProvider = "the-graph";
                break;
            case Coins.COINS.MASKERC20.ticker:
                coinIdClearForProvider = "mask-network";
                break;
            case Coins.COINS.TUSDERC20.ticker:
                coinIdClearForProvider = "true-usd";
                break;
            case Coins.COINS.TUSDTRC20.ticker:
                coinIdClearForProvider = "true-usd";
                break;
            case Coins.COINS._1INCHERC20.ticker:
                coinIdClearForProvider = "1inch";
                break;
            case Coins.COINS.QNTERC20.ticker:
                coinIdClearForProvider = "quant-network";
                break;
            case Coins.COINS.FLOKIERC20.ticker:
                coinIdClearForProvider = "floki";
                break;
            case Coins.COINS.HEXERC20.ticker:
                coinIdClearForProvider = "hex";
                break;
            case Coins.COINS.UNIERC20.ticker:
                coinIdClearForProvider = "uniswap";
                break;
            case Coins.COINS.FETERC20.ticker:
                coinIdClearForProvider = "fetch-ai";
                break;
            case Coins.COINS.SNXERC20.ticker:
                coinIdClearForProvider = "havven";
                break;
            case Coins.COINS.SUSHIERC20.ticker:
                coinIdClearForProvider = "sushi";
                break;
            case Coins.COINS.LDOERC20.ticker:
                coinIdClearForProvider = "lido-dao";
                break;
            case Coins.COINS.APEERC20.ticker:
                coinIdClearForProvider = "apecoin";
                break;
            case Coins.COINS.IMXERC20.ticker:
                coinIdClearForProvider = "immutable-x";
                break;
            case Coins.COINS.RNDRERC20.ticker:
                coinIdClearForProvider = "render-token";
                break;
            case Coins.COINS.JSTTRC20.ticker:
                coinIdClearForProvider = "just";
                break;
            case Coins.COINS.YFIERC20.ticker:
                coinIdClearForProvider = "yearn-finance";
                break;
            case Coins.COINS.SUNTRC20.ticker:
                coinIdClearForProvider = "sun-token";
                break;
            case Coins.COINS.BTTTRC20.ticker:
                coinIdClearForProvider = "bittorrent";
                break;
            case Coins.COINS.USDDTRC20.ticker:
                coinIdClearForProvider = "usdd";
                break;
            case Coins.COINS.CVXERC20.ticker:
                coinIdClearForProvider = "convex-finance";
                break;
            case Coins.COINS.STETHERC20.ticker:
                coinIdClearForProvider = "staked-ether";
                break;
            case Coins.COINS.PAXGERC20.ticker:
                coinIdClearForProvider = "pax-gold";
                break;
            case Coins.COINS.SYNERC20.ticker:
                coinIdClearForProvider = "synapse-2";
                break;
            case Coins.COINS.FXSERC20.ticker:
                coinIdClearForProvider = "frax-share";
                break;
            case Coins.COINS.LPTERC20.ticker:
                coinIdClearForProvider = "livepeer";
                break;
            case Coins.COINS.BALERC20.ticker:
                coinIdClearForProvider = "balancer";
                break;
            case Coins.COINS.VRAERC20.ticker:
                coinIdClearForProvider = "verasity";
                break;
            case Coins.COINS.WTRXTRC20.ticker:
                coinIdClearForProvider = "wrapped-tron";
                break;
            case Coins.COINS.STGERC20.ticker:
                coinIdClearForProvider = "stargate-finance";
                break;
            case Coins.COINS.LRCERC20.ticker:
                coinIdClearForProvider = "loopring";
                break;
            default:
                throw new Error("Add support for the coin to coingecko coin-usd rates provider:" + coin.ticker);
        }

        return coinIdClearForProvider;
    });
}

function coinsToMessariIds(coins) {
    return coins.map(coin => {
        let coinIdClearForProvider = null;
        switch (coin.ticker) {
            case Coins.COINS.BTC.ticker:
                coinIdClearForProvider = "bitcoin";
                break;
            case Coins.COINS.ETH.ticker:
                coinIdClearForProvider = "ethereum";
                break;
            case Coins.COINS.USDTERC20.ticker:
                coinIdClearForProvider = "tether";
                break;
            case Coins.COINS.TRX.ticker:
                coinIdClearForProvider = "tron";
                break;
            case Coins.COINS.USDTTRC20.ticker:
                coinIdClearForProvider = "tether";
                break;
            case Coins.COINS.USDCERC20.ticker:
                coinIdClearForProvider = "usd-coin";
                break;
            case Coins.COINS.USDCTRC20.ticker:
                coinIdClearForProvider = "usd-coin";
                break;
            case Coins.COINS.SHIBERC20.ticker:
                coinIdClearForProvider = "shiba-inu";
                break;
            case Coins.COINS.BUSDERC20.ticker:
                coinIdClearForProvider = "binance-usd";
                break;
            // Doesn't support FTM
            case Coins.COINS.MATICERC20.ticker:
                coinIdClearForProvider = "polygon";
                break;
            // Doesn't support GALA
            // Doesn't support LINK
            // Doesn't support AGIX
            case Coins.COINS.DAIERC20.ticker:
                coinIdClearForProvider = "dai";
                break;
            // Doesn't support SAND
            case Coins.COINS.WBTCERC20.ticker:
                coinIdClearForProvider = "wrapped-bitcoin";
                break;
            // Doesn't support BLUR
            // Doesn't support GRT
            // Doesn't support MASK
            // Doesn't support TUSD
            // Doesn't support 1INCH
            // Doesn't support QNT
            // Doesn't support FLOKI
            // Doesn't support HEX
            case Coins.COINS.UNIERC20.ticker:
                coinIdClearForProvider = "uniswap";
                break;
            // Doesn't support FET
            // Doesn't support SNX
            // Doesn't support SUSHI
            // Doesn't support LDO
            // Doesn't support APE
            // Doesn't support IMX
            // Doesn't support RNDR
            // Doesn't support JST
            // Doesn't support YFI
            // Doesn't support SUN
            // Doesn't support BTT
            // Doesn't support USDD
            // Doesn't support CVX
            case Coins.COINS.STETHERC20.ticker:
                coinIdClearForProvider = "staked-ether";
                break;
            // Doesn't support PAXG
            // Doesn't support SYN
            // Doesn't support FXS
            // Doesn't support LPT
            // Doesn't support BAL
            // Doesn't support VRA
            // Doesn't support WTRX
            // Doesn't support STG
            // Doesn't support LRC
            default:
                throw new Error("Add support for the coin to messari coin-usd rates at date provider" + coin.ticker);
        }
        return coinIdClearForProvider;
    });
}

export function areCoinsSupportedByCex(coins) {
    const cexSupports = [
        Coins.COINS.BTC,
        Coins.COINS.ETH,
        Coins.COINS.TRX,
        Coins.COINS.USDTERC20,
        Coins.COINS.USDTTRC20,
        Coins.COINS.USDCTRC20,
        Coins.COINS.USDCERC20,
        Coins.COINS.SHIBERC20,
        Coins.COINS.BUSDERC20,
        Coins.COINS.FTMERC20,
        Coins.COINS.MATICERC20,
        Coins.COINS.LINKERC20,
        Coins.COINS.DAIERC20,
        Coins.COINS.SANDERC20,
        Coins.COINS.WBTCERC20,
        Coins.COINS.TUSDTRC20,
        Coins.COINS.TUSDERC20,
        Coins.COINS._1INCHERC20,
        Coins.COINS.QNTERC20,
        Coins.COINS.UNIERC20,
        Coins.COINS.SNXERC20,
        Coins.COINS.SUSHIERC20,
        Coins.COINS.LDOERC20,
        Coins.COINS.APEERC20,
        Coins.COINS.YFIERC20,
        // Coins.COINS.PAXGERC20, // :USDT only
        Coins.COINS.BALERC20,
        Coins.COINS.LRCERC20,
    ];
    return coins.find(coin => !cexSupports.find(supported => supported === coin)) == null;
}
