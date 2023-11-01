import { getCurrentNetwork } from "../services/internal/storage";
import { Coins } from "../../wallet/coins";

/**
 * Models a group of APIs provided by the same owner and used for different services in our app.
 * It means we need to mention RPS several times for each usage and also have some holder of last call timestamp per
 * api group. So this concept allows to use it for exact ExternalApiProvider and make sure that you use the same
 * RPS value and make decisions on base of the same timestamp of last call to the API group owner.
 */
export class ApiGroup {
    constructor(id, rps, backendProxyIdGenerator = null) {
        this.id = id;
        this.rps = rps;
        this.lastCalledTimestamp = null;
        this.backendProxyIdGenerator = backendProxyIdGenerator;
    }

    isRpsExceeded() {
        return (this.lastCalledTimestamp ?? 0) + Math.floor(1000 / this.rps) > Date.now();
    }

    actualizeLastCalledTimestamp() {
        this.lastCalledTimestamp = Date.now();
    }
}

export const ApiGroups = {
    /**
     * Currently we use free version of etherscan provider with 0.2 RPS. But we have API key with 100k requests free
     * per month. So we can add it if not enough current RPS.
     */
    ETHERSCAN: new ApiGroup("etherscan", 0.17), // Actually 0.2 but fails sometime, so we use smaller
    ALCHEMY: new ApiGroup("alchemy", 0.3, network => `alchemy-${(network || getCurrentNetwork(Coins.COINS.ETH)).key}`),
    BLOCKSTREAM: new ApiGroup("blockstream", 0.2),
    BLOCKCHAIN_INFO: new ApiGroup("blockchain.info", 1),
    BLOCKNATIVE: new ApiGroup("blocknative", 0.5),
    ETHGASSTATION: new ApiGroup("ethgasstation", 0.5),
    TRONGRID: new ApiGroup(
        "trongrid",
        0.3,
        network => `trongrid-${(network || getCurrentNetwork(Coins.COINS.TRX)).key}`
    ),
    TRONSCAN: new ApiGroup("tronscan", 0.3),
    GETBLOCK: new ApiGroup("getblock", 0.3),
    COINCAP: new ApiGroup("coincap", 0.5), // 200 per minute without API key
    COINGECKO: new ApiGroup("coingecko", 0.9), // actually 0.13-0.5 according to the docs but we use smaller due to expirienced frequent abuses
    MESSARI: new ApiGroup("messari", 0.2),
    BTCCOM: new ApiGroup("btccom", 0.2),
    BITAPS: new ApiGroup("bitaps", 0.25), // Docs say that RPS is 3 but using it causes frequent 429 HTTP errors
    CEX: new ApiGroup("cex", 0.5), // Just assumption for RPS
    BIGDATACLOUD: new ApiGroup("bigdatacloud", 1), // Just assumption for RPS
    TRACKIP: new ApiGroup("trackip", 1), // Just assumption for RPS
    IPIFY: new ApiGroup("ipify", 1), // Just assumption for RPS
    WHATISMYIPADDRESS: new ApiGroup("whatismyipaddress", 1), // Just assumption for RPS
    EXCHANGERATE: new ApiGroup("exchangerate", 1), // Just assumption for RPS
    FRANKFURTER: new ApiGroup("frankfurter", 1), // Just assumption for RPS
    BITGO: new ApiGroup("bitgo", 1), // Just assumption for RPS
    BITCOINER: new ApiGroup("bitcoiner", 1), // Just assumption for RPS
    BITCORE: new ApiGroup("bitcore", 1), // Just assumption for RPS
    // BLOCKCHAIR: new ApiGroup("blockchair", 0.04), // this provider require API key for commercial use (10usd 10000 reqs), we will add it later
    MEMPOOL: new ApiGroup("mempool", 0.2), // Just assumption for RPS
};
