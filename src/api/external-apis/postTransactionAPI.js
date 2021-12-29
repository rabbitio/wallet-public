import RobustExternalAPICallerService from "../utils/robustExternalAPICallerService";
import { testnet } from "../lib/networks";

export const postTransactionAPICaller = new RobustExternalAPICallerService("postTransactionAPICaller", [
    {
        endpoint: "https://blockstream.info/",
        httpMethod: "post",
        composeQueryString: params => {
            const network = params[1];
            const networkPath = network.key === testnet.key ? "testnet/" : "";
            return `${networkPath}api/tx`;
        },
        getDataByResponse: response => response.data,
        composeBody: params => {
            const hex = params[0];
            return `${hex}`;
        },
    },
    {
        endpoint: "https://api.bitcore.io/api/BTC/",
        httpMethod: "post",
        composeQueryString: params => {
            const network = params[1];
            const networkPath = network.key === testnet.key ? "testnet/" : "mainnet/";
            return `${networkPath}tx/send`;
        },
        getDataByResponse: response => response.data,
        composeBody: params => {
            const hex = params[0];
            return `${hex}`;
        },
    },
    {
        endpoint: "", // TODO: [refactoring, critical] Remove smartbit as it is died
        httpMethod: "post",
        composeQueryString: params => {
            const network = params[1];
            return network.key === testnet.key
                ? "https://testnet-api.smartbit.com.au/v1/blockchain/"
                : "https://api.smartbit.com.au/v1/blockchain/";
        },
        getDataByResponse: response => +(response.data || null),
        composeBody: params => {
            const hex = params[0];
            return JSON.stringify({ hex });
        },
    },
    // TODO: [feature, moderate] Add more providers as SMARTBIT fails
]);
