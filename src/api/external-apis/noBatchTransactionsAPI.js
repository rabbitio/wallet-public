import RobustExternalAPICallerService from "../utils/robustExternalAPICallerService";
import { Input } from "../models/transaction/input";
import { Output } from "../models/transaction/output";
import { Transaction } from "../models/transaction/transaction";
import { btcToSatoshi } from "../lib/btc-utils";
import { externalBlocksAPICaller } from "./blocksAPI";
import { P2PKH_SCRIPT_TYPE, P2SH_SCRIPT_TYPE, P2WPKH_SCRIPT_TYPE } from "../lib/utxos";
import { improveAndRethrow } from "../utils/errorUtils";
import { provideFirstSeenTime } from "./utils/firstSeenTimeHolder";
import { getHash } from "../adapters/crypto-utils";
import { testnet } from "../lib/networks";
import { safeStringify } from "../utils/browserUtils";

const externalTransactionsDataAPICaller = new RobustExternalAPICallerService("externalTransactionsDataAPICaller", [
    {
        timeout: 10000,
        RPS: 10,
        endpoint: "https://blockstream.info/",
        httpMethod: "get",
        composeQueryString: params => {
            const [network, address] = params;
            const networkPath = network.key === testnet.key ? "testnet/" : "";
            return `${networkPath}api/address/${address}/txs`;
        },
        getDataByResponse: (response, params) => {
            // TODO: [bug, critical] Returns only 25 confirmed and 50 unconfirmed transactions. Use last_seen_txid to get remaining confirmed
            const currentBlockNumber = params[2];
            return (response?.data ?? []).map(tx => {
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
                    tx.status?.block_height ? currentBlockNumber - tx?.status.block_height + 1 : 0,
                    tx.status?.block_height ?? 0,
                    tx?.status.block_time || provideFirstSeenTime(getHash(tx.txid)),
                    tx.fee,
                    null, // This provider have no such analysis
                    inputs,
                    outputs
                );
            });
        },
    },
    {
        timeout: 90000,
        RPS: 5,
        endpoint: "https://tradeblock.com/blockchain/api/v2.0/btc/related",
        httpMethod: "get",
        composeQueryString: params => {
            const address = params[1];
            return `?addr=${address}&limit_var=10000&offset_var=0`;
        },
        getDataByResponse: (response, params) => {
            const currentBlockNumber = params[2];
            return (response?.data ?? []).map(tx => {
                const mapType = type =>
                    type === "witness_v0_keyhash"
                        ? P2WPKH_SCRIPT_TYPE
                        : type === "pubkeyhash"
                        ? P2PKH_SCRIPT_TYPE
                        : type === "scripthash"
                        ? P2SH_SCRIPT_TYPE
                        : null;
                const inputs = tx.vin.map(
                    input =>
                        new Input(
                            input.address[0],
                            btcToSatoshi(input.value),
                            input.txid,
                            input.vout,
                            null, // This provider have no such analysis
                            null // This provider have no such analysis
                        )
                );

                const outputs = tx.vout.map(
                    output =>
                        new Output(
                            output.scriptpubkey_addresses,
                            btcToSatoshi(output.value),
                            mapType(output.type),
                            null, // This provider have no such analysis
                            output.n
                        )
                );

                return new Transaction(
                    tx.txid,
                    tx.blockheight ? currentBlockNumber - tx.blockheight + 1 : 0,
                    tx.blockheight ?? 0,
                    tx.time || tx.blocktime,
                    btcToSatoshi(tx.total_vin - tx.total_vout),
                    null, // This provider have no such analysis
                    inputs,
                    outputs
                );
            });
        },
    },
    {
        timeout: 10000,
        RPS: 3,
        endpoint: "https://api.bitaps.com/btc/",
        httpMethod: ["get", "get"],
        composeQueryString: [
            params => {
                const [network, address] = params;
                const networkPath = network.key === testnet.key ? "testnet/" : "";
                return `${networkPath}v1/blockchain/address/transactions/${address}?mode=verbose`;
            },
            params => {
                const [network, address] = params;
                const networkPath = network.key === testnet.key ? "testnet/" : "";
                return `${networkPath}v1/blockchain/address/unconfirmed/transactions/${address}?mode=verbose`;
            },
        ],
        getDataByResponse: (response, params) => {
            const currentBlockNumber = params[2];
            return (response?.data?.list ?? []).map(tx => {
                const mapType = type =>
                    type === "P2WPKH"
                        ? P2WPKH_SCRIPT_TYPE
                        : type === "P2PKH"
                        ? P2PKH_SCRIPT_TYPE
                        : type === "P2SH"
                        ? P2SH_SCRIPT_TYPE
                        : null;
                const inputs = tx.vIn.map(
                    input =>
                        new Input(
                            input.address,
                            btcToSatoshi(input.amount),
                            input.txId,
                            input.vOut,
                            mapType(input.type),
                            input.sequence
                        )
                );

                const outputs = Object.keys(tx.vOut).map(outputIndex => {
                    const output = tx.vOut[outputIndex];
                    return new Output(
                        [output.address],
                        btcToSatoshi(output.value),
                        mapType(output.type),
                        output.spent?.txId,
                        outputIndex
                    );
                });

                return new Transaction(
                    tx.txId,
                    tx.blockHeight ? currentBlockNumber - tx.blockHeight + 1 : 0,
                    tx.blockHeight ?? 0,
                    tx.timestamp || tx.blockTime,
                    tx.fee,
                    null, // This provider have no such analysis
                    inputs,
                    outputs
                );
            });
        },
    },
    {
        // TODO: [feature, low] Pagination should be added as currently at most 50 txs can be returned
        timeout: 7000,
        RPS: 0.1,
        endpoint: "https://chain.api.btc.com/v3/address",
        httpMethod: "get",
        composeQueryString: params => {
            const address = params[1];
            return `/${address}/tx`;
        },
        getDataByResponse: (response, params) => {
            return (response?.data?.data?.list ?? []).map(tx => {
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
                        new Output(
                            output.addresses,
                            output.value,
                            mapType(output.type),
                            output.spent_by_tx || null,
                            index
                        )
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
            });
        },
    },
]);

export async function performNoBatchTransactionsDataRetrieval(
    addressesList,
    network,
    cancelProcessingHolder,
    addressesUpdateTimestampsVariableParameter,
    maxAttemptsCountToGetDataForEachAddress = 1
) {
    try {
        // eslint-disable-next-line no-console
        console.log("NOBATCHHH STRTTT " + JSON.stringify(addressesList));
        const currentBlock = await externalBlocksAPICaller.callExternalAPI([network], 6000);
        const data = await Promise.all(
            addressesList.map(address => {
                if (cancelProcessingHolder == null || !cancelProcessingHolder.isCanceled()) {
                    return externalTransactionsDataAPICaller
                        .callExternalAPI(
                            [network, address, currentBlock],
                            5000,
                            cancelProcessingHolder && cancelProcessingHolder.getToken(),
                            maxAttemptsCountToGetDataForEachAddress
                        )
                        .then(result => {
                            Array.isArray(result) &&
                                addressesUpdateTimestampsVariableParameter.push({ address, timestamp: Date.now() });
                            return result;
                        });
                }

                return new Promise(resolve => resolve([]));
            })
        );

        // eslint-disable-next-line no-console
        console.log("NOBATCHHH GTTTT " + JSON.stringify(data));

        // Removing duplicated transactions from retrieved list
        return data
            .flat()
            .reduce(
                (deduplicated, currentTx) =>
                    !deduplicated.find(tx => currentTx.txid === tx.txid) ? [currentTx, ...deduplicated] : deduplicated,
                []
            );
    } catch (e) {
        // eslint-disable-next-line no-console
        console.log("NOBATCHHH ERRRR " + safeStringify(e));
        improveAndRethrow(e, "performNoBatchTransactionsDataRetrieval");
    }
}
