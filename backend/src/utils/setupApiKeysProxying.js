import log4js from "log4js";
import { createProxyMiddleware } from "http-proxy-middleware";

import { improveAndRethrow } from "@rabbitio/ui-kit";

import {
    ALCHEMY_API_KEY_ETH_TESTNET,
    ALCHEMY_API_KEY_ETH_MAINNET,
    SWAPSPACE_API_KEY,
    TRONGRID_API_KEY,
    LETSEXCHANGE_API_KEY,
    ETHERSCAN_API_KEY,
} from "../properties.js";

// TODO: [tests, critical] easier than to test it manually
/**
 * TODO: [dev] add docs
 * @return {{ path: string, middleware: object }[]}
 */
export function setupApiKeysProxying(apiKeysProxyBasePath) {
    try {
        const logger = log4js.getLogger("apiKeysProxy");
        logger.level = "debug";
        const basePath = `^${apiKeysProxyBasePath}`;
        const generatePreserveOriginalPathFunc = (id, extraQuery = []) => {
            return path => {
                let rewritten = path.replace(`${apiKeysProxyBasePath}/${id}`, "");
                if (extraQuery.length) {
                    rewritten +=
                        (rewritten.includes("?") ? "&" : "?") +
                        extraQuery
                            .map(item => `${encodeURIComponent(item[0])}=${encodeURIComponent(item[1])}`)
                            .join("&");
                }
                return rewritten;
            };
        };

        const apisParams = {
            ALCHEMY_MAINNET: {
                id: "alchemy-mainnet",
                fqdn: `https://eth-mainnet.g.alchemy.com`,
                newPath: `/v2/${ALCHEMY_API_KEY_ETH_MAINNET}`,
            },
            ALCHEMY_TESTNET: {
                id: "alchemy-goerli",
                fqdn: `https://eth-goerli.g.alchemy.com`,
                newPath: `/v2/${ALCHEMY_API_KEY_ETH_TESTNET}`,
            },
            ETHERSCAN_MAINNET: {
                id: "etherscan-mainnet",
                fqdn: `https://api.etherscan.io/v2/api`,
                pathRewrite: generatePreserveOriginalPathFunc("etherscan-mainnet", [
                    ["apikey", ETHERSCAN_API_KEY],
                    ["chainid", 1],
                ]),
            },
            ETHERSCAN_TESTNET: {
                id: "etherscan-goerli",
                fqdn: `https://api.etherscan.io/v2/api`,
                pathRewrite: generatePreserveOriginalPathFunc("etherscan-goerli", [
                    ["apikey", ETHERSCAN_API_KEY],
                    ["chainid", 11155111], // TODO: [feature, low] Actually, this is Sepoila testnet ID. Goerly is removed from etherscan. Testnets were not tested for a long time in Rabbit Wallet. task_id=4c3fa8bd6a6444819909bf6c384f1f7c
                ]),
            },
            TRONGRID_MAINNET: {
                id: "trongrid-mainnet",
                pathRewrite: generatePreserveOriginalPathFunc("trongrid-mainnet"),
                fqdn: `https://api.trongrid.io`,
                customHeaders: [["TRON-PRO-API-KEY", TRONGRID_API_KEY]],
            },
            TRONGRID_TESTNET: {
                id: "trongrid-nile",
                pathRewrite: generatePreserveOriginalPathFunc("trongrid-nile"),
                fqdn: `https://nile.trongrid.io`,
                customHeaders: [["TRON-PRO-API-KEY", TRONGRID_API_KEY]],
            },
            SWAPSPACE: {
                id: "swapspace",
                pathRewrite: generatePreserveOriginalPathFunc("swapspace"),
                fqdn: `https://api.swapspace.co`,
                customHeaders: [["Authorization", SWAPSPACE_API_KEY]],
            },
            LETSEXCHANGE: {
                id: "letsexchange",
                pathRewrite: generatePreserveOriginalPathFunc("letsexchange"),
                fqdn: `https://api.letsexchange.io/api`,
                customHeaders: [
                    ["Authorization", `Bearer ${LETSEXCHANGE_API_KEY}`],
                    ["Content-Type", "application/json"],
                    ["Accept", "application/json"],
                ],
            },
        };
        const buildProxyOptions = apiParams => ({
            target: apiParams.fqdn,
            pathRewrite: apiParams.pathRewrite || { [`${basePath}/${apiParams.id}`]: apiParams.newPath },
            changeOrigin: true,
            logger: logger,
            onError: (err, req, res) => {
                logger.error("Failed to proxy API request", err);
            },
            onProxyReq: (proxyReq, req, res) => {
                (apiParams.customHeaders || []).forEach(item => proxyReq.setHeader(item[0], item[1]));
            },
            onProxyRes: (proxyRes, req, res) => {
                const exchange = `[${req.method}] [${proxyRes.statusCode}] ${req.path} -> ${proxyRes.req.protocol}//${proxyRes.req.host}${proxyRes.req.path}`;
                logger.debug("[API KEYS PROXY] " + exchange); // [GET] [200] /originalPath -> http://www.example.com/targetPath
            },
        });
        return Object.keys(apisParams).map(key => {
            const options = buildProxyOptions(apisParams[key]);
            const middleware = createProxyMiddleware(options);
            return { path: `${basePath}/${apisParams[key].id}`, middleware: middleware };
        });
    } catch (e) {
        improveAndRethrow(e, "setupApiKeysProxying");
    }
}
