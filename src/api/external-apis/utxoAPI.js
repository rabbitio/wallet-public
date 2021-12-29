import RobustExternalAPICallerService from "../utils/robustExternalAPICallerService";
import { testnet } from "../lib/networks";
import { Utxo } from "../models/transaction/utxo";

// This provide is not used now TODO: [refactoring, low] consider removing it
export const externalUTXOsAPICaller = new RobustExternalAPICallerService("externalUTXOsAPICaller", [
    {
        endpoint: "https://blockstream.info/",
        httpMethod: "get",
        composeQueryString: params => {
            const [network, address] = params;
            const networkPath = network.key === testnet.key ? "testnet/" : "";
            return `${networkPath}api/address/${address}/utxo`;
        },
        getDataByResponse: (response, params) =>
            (response.data || []).map(
                utxo => new Utxo(utxo.txid, utxo.vout, utxo.value, utxo.block_height || 0, null, params[1])
            ),
    },
    {
        // RPC ~0.1-0.2
        endpoint: "https://chain.api.btc.com/v3/address/",
        httpMethod: "get",
        composeQueryString: params => {
            const address = params[1];
            return `${address}/unspent`;
        },
        getDataByResponse: (response, params) =>
            (response.data.list || []).map(
                utxo => new Utxo(utxo.tx_hash, utxo.tx_output_n, utxo.value, utxo.confirmations, null, params[1])
            ),
    },
]);
