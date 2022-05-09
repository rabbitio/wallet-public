import RobustExternalAPICallerService from "../utils/robustExternalAPICallerService";
import { P2PKH_SCRIPT_TYPE, P2SH_SCRIPT_TYPE, P2WPKH_SCRIPT_TYPE } from "../lib/utxos";
import { Input } from "../models/transaction/input";
import { Output } from "../models/transaction/output";
import { Transaction } from "../models/transaction/transaction";
import { getHash } from "../adapters/crypto-utils";
import { provideFirstSeenTime } from "./utils/firstSeenTimeHolder";
import { improveAndRethrow } from "../utils/errorUtils";
import { externalBlocksAPICaller } from "./blocksAPI";
import { testnet } from "../lib/networks";

export const transactionDataAPICaller = new RobustExternalAPICallerService("transactionDataAPICaller", [
    {
        endpoint: "https://blockstream.info/",
        httpMethod: "get",
        composeQueryString: params => {
            const network = params[0];
            const txid = params[1];
            const networkPath = network.key === testnet.key ? "testnet/" : "";
            return `${networkPath}api/tx/${txid}`;
        },
        getDataByResponse: (response, params) => {
            const currentBlockNumber = params[2];
            const tx = response.data;
            const mapType = type =>
                type === "v0_p2wpkh" ? P2WPKH_SCRIPT_TYPE : type === "p2pkh" ? P2PKH_SCRIPT_TYPE : P2SH_SCRIPT_TYPE;
            const inputs = tx.vin.map(
                input =>
                    new Input(
                        input.prevout.scriptpubkey_address,
                        input.prevout.value,
                        input.txid,
                        input.vout,
                        mapType(input.prevout.scriptpubkey_type),
                        input.sequence
                    )
            );

            const outputs = tx.vout.map(
                (output, index) =>
                    new Output(
                        [output.scriptpubkey_address],
                        output.value,
                        mapType(output.scriptpubkey_type),
                        null,
                        index
                    )
            );

            return new Transaction(
                tx.txid,
                tx.status.block_height ? currentBlockNumber - tx.status.block_height + 1 : 0,
                tx.status?.block_height ?? 0,
                tx.status.block_time || provideFirstSeenTime(getHash(tx.txid)),
                tx.fee,
                null, // This provider have no such analysis
                inputs,
                outputs
            );
        },
    },
    {
        /**
         * API docs https://developer.bitaps.com/blockchain
         */
        timeout: 10000,
        RPS: 2, // Docs say that RPS is 3 but using it causes frequent 429 HTTP errors
        endpoint: "https://api.bitaps.com/btc/",
        httpMethod: "get",
        composeQueryString: params => {
            const [network, txid] = params;
            const networkPath = network.key === testnet.key ? "testnet/" : "";
            return `${networkPath}v1/blockchain/transaction/${txid}`;
        },
        getDataByResponse: (response, params) => {
            const currentBlockNumber = params[2];
            const tx = response.data;
            const mapType = type =>
                type === "P2WPKH"
                    ? P2WPKH_SCRIPT_TYPE
                    : type === "P2PKH"
                    ? P2PKH_SCRIPT_TYPE
                    : type === "P2SH"
                    ? P2SH_SCRIPT_TYPE
                    : "";
            const inputs = Object.keys(tx.vIn).map(inputIndex => {
                const input = tx.vIn[inputIndex];
                return new Input(
                    input.address,
                    input.amount,
                    input.txId,
                    input.vOut,
                    mapType(input.type),
                    input.sequence
                );
            });

            const outputs = Object.keys(tx.vOut).map(outputIndex => {
                const output = tx.vOut[outputIndex];
                return new Output(
                    [output.address],
                    output.value,
                    mapType(output.type),
                    output.spent[0] ?? null,
                    +outputIndex
                );
            });

            return new Transaction(
                tx.txId,
                tx.blockHeight ? currentBlockNumber - tx.blockHeight + 1 : 0,
                tx.blockHeight ?? 0,
                tx.time || provideFirstSeenTime(getHash(tx.txId)),
                tx.fee,
                null, // This provider have no such analysis
                inputs,
                outputs
            );
        },
    },
    {
        // TODO: [feature, low] Remove this provider as it has small RPS and does not provide unconfirmed transactions by address
        endpoint: "https://chain.api.btc.com/v3/tx/",
        httpMethod: "get",
        composeQueryString: params => params[1], // second one is txid
        getDataByResponse: (response, params) => {
            const tx = response.data.data;
            const mapType = type =>
                type === "P2WPKH_V0" ? P2WPKH_SCRIPT_TYPE : type === "P2PKH" ? P2PKH_SCRIPT_TYPE : P2SH_SCRIPT_TYPE;
            const inputs = tx.inputs.map(
                input =>
                    new Input(
                        input.prev_addresses[0],
                        input.prev_value,
                        input.prev_tx_hash,
                        input.prev_position,
                        mapType(input.prev_type),
                        input.sequence
                    )
            );

            const outputs = tx.outputs.map(
                (output, index) =>
                    new Output(output.addresses, output.value, mapType(output.type), output.spent_by_tx || null, index)
            );

            return new Transaction(
                tx.hash,
                tx.confirmations,
                tx.confirmations > 0 ? params[2] - tx.confirmations + 1 : 0,
                tx.block_time ?? provideFirstSeenTime(getHash(tx.hash)),
                tx.fee,
                tx.is_double_spend,
                inputs,
                outputs
            );
        },
    },
]);

export async function retrieveTransactionData(txid, network) {
    try {
        const currentBlock = await externalBlocksAPICaller.callExternalAPI([network], 6000);
        return await transactionDataAPICaller.callExternalAPI([network, txid, currentBlock], 15000);
    } catch (e) {
        improveAndRethrow(e, "retrieveTransactionData");
    }
}
