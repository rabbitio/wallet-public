import RobustExternalAPICallerService from "../utils/robustExternalAPICallerService";
import { mainnet, testnet } from "../lib/networks";

export const externalBlocksAPICaller = new RobustExternalAPICallerService("externalBlocksAPICaller", [
    {
        endpoint: "https://blockstream.info/",
        timeout: 10000,
        RPS: 10,
        httpMethod: "get",
        composeQueryString: params => {
            const network = params[0];
            const networkPath = network.key === testnet.key ? "testnet/" : "";
            return `${networkPath}api/blocks/tip/height`;
        },
        getDataByResponse: response => +response.data || null,
    },
    {
        endpoint: "https://blockchain.info/latestblock?cors=true",
        timeout: 10000,
        RPS: 30, // Just an assumption
        httpMethod: "get",
        composeQueryString: params => "",
        getDataByResponse: (response, params) =>
            params[0].key === mainnet.key ? +response.data?.height ?? null : null,
    },
    {
        endpoint: "https://chain.api.btc.com/v3/block/latest",
        timeout: 7000,
        RPS: 0.1,
        httpMethod: "get",
        composeQueryString: () => "",
        getDataByResponse: response => +response.data.height || null,
    },
    // TODO: [feature, low] add more APIs (for testnet)
]);
