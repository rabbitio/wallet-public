import { getLogger } from "log4js";
import { createProxyMiddleware } from "http-proxy-middleware";
import { improveAndRethrow } from "./utils";
import {
    ALCHEMY_API_KEY_ETH_TESTNET,
    ALCHEMY_API_KEY_ETH_MAINNET,
    SWAPSPACE_API_KEY,
    TRONGRID_API_KEY,
} from "../properties";

// TODO: [tests, critical] easier than to test it manually
/**
 * TODO: [dev] add docs
 * @return {{ path: string, middleware: object }[]}
 */
export function setupApiKeysProxying(apiKeysProxyBasePath) {
    try {
        const logger = getLogger("apiKeysProxy");
        logger.level = "debug";
        const basePath = `^${apiKeysProxyBasePath}`;
        const generatePreserveOriginalPathFunc = id => path => path.replace(`${apiKeysProxyBasePath}/${id}`, "");
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
