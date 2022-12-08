import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";
import { Input } from "../models/transaction/input";
import { Output } from "../models/transaction/output";
import { Transaction } from "../models/transaction/transaction";
import { btcToSatoshi } from "../lib/btc-utils";
import { P2PKH_SCRIPT_TYPE, P2SH_SCRIPT_TYPE, P2WPKH_SCRIPT_TYPE } from "../lib/utxos";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { provideFirstSeenTime } from "../../common/external-apis/utils/firstSeenTimeHolder";
import { getHash } from "../../../common/adapters/crypto-utils";
import { currentBlockService } from "../services/internal/currentBlockService";
import { Coins } from "../../coins";

/**
 * Params array for each provider should contain exactly 3 parameters:
 *     params[0] {Network} - Network object to get transactions for
 *     params[1] {string} - address string
 *     params[2] {number} - current block number
 */
export const noBatchTransactionsProviders = [
    {
        /**
         * API documentation https://github.com/Blockstream/esplora/blob/master/API.md
         */
        maxPageLength: 25,
        timeout: 20000,
        RPS: 10,
        endpoint: "https://blockstream.info/",
        httpMethod: "get",
        composeQueryString: function(params) {
            const [network, address] = params;
            const networkPath = network.key === Coins.COINS.BTC.testnet.key ? "testnet/" : "";
            let query = `${networkPath}api/address/${address}/txs`;
            if (params[3]) {
                // For pagination. This parameter should not be passed when using this API - we add this parameter internally
                query = `${query}/chain/${params[3]}`;
            }

            return query;
        },
        changeQueryParametersForPageNumber: function(params, previousResponse, pageNumber) {
            const previousData = previousResponse?.data;
            if (!previousData || !Array.isArray(previousData) || pageNumber === 0) {
                return params;
            }

            return [params[0], params[1], params[2], previousData[previousData?.length - 1].txid];
        },
        checkWhetherResponseIsForLastPage: function(previousResponse, currentResponse, currentPageNumber) {
            return (
                currentResponse?.data == null ||
                !Array.isArray(currentResponse.data) ||
                currentResponse.data.filter(tx => tx?.status?.block_height != null).length < this.maxPageLength
            );
        },
        /* NOTE: this provider returns only 50 unconfirmed transactions for the passed address. So it can cause
                 the tricky bugs in rare cases when someone uses the same address and there are a lot of transactions
                 to this address
                 TODO: maybe throw an error to use another provider if we see 50 unconfirmed transactions? or just
                       ignore as eventually we will see all transactions (after the confirmation)
         */
        getDataByResponse: function(response, params) {
            if (response?.data == null) {
                return null;
            }

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
                    tx.status?.block_height && currentBlockNumber
                        ? currentBlockNumber - tx?.status.block_height + 1
                        : 0,
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
        /**
         * This API is not documented and just discovered manually. It has pagination, but I tried even 300 transactions
         * per request and no restrictions were discovered - the API returns all the transactions successfully.
         * So we use 300 as page size for this request.
         */
        maxPageLength: 300,
        timeout: 120000,
        RPS: 5,
        endpoint: "https://tradeblock.com/blockchain/api/v2.0/btc/related",
        httpMethod: "get",
        composeQueryString: function(params) {
            const address = params[1];
            let query = `?addr=${address}&limit_var=${this.maxPageLength}&offset_var=`;
            query = `${query}${params[3] != null ? `${params[3] * this.maxPageLength}` : "0"}`;

            return query;
        },
        changeQueryParametersForPageNumber: function(params, previousResponse, pageNumber) {
            if (!previousResponse || pageNumber === 0) {
                return params;
            }

            return [params[0], params[1], params[2], pageNumber];
        },
        checkWhetherResponseIsForLastPage: function(previousResponse, currentResponse, currentPageNumber) {
            return (currentResponse?.data?.length ?? 0) < this.maxPageLength;
        },
        getDataByResponse: function(response, params) {
            if (response?.data == null) {
                return null;
            }

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
                    tx.blockheight && currentBlockNumber ? currentBlockNumber - tx.blockheight + 1 : 0,
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
        /**
         * API docs https://developer.bitaps.com/blockchain.
         * This API provides separate endpoints for confirmed and unconfirmed transactions.
         * Max transactions per page is 50, but we use 13 as this provider fails to return the whole requested
         * data and cuts it - looks like it has some not-documented data size restrictions.
         */
        maxPageLength: 13,
        timeout: 20000,
        RPS: 0.5, // Docs say that RPS is 3 but using it causes frequent 429 HTTP errors
        endpoint: "https://api.bitaps.com/btc/",
        httpMethod: ["get", "get"], // Separate requests for confirmed and unconfirmed transactions
        composeQueryString: (function() {
            const createQueryComposerGenerator = function(unconfirmed) {
                return function(params) {
                    const [network, address] = params;
                    const networkPath = network.key === Coins.COINS.BTC.testnet.key ? "testnet/" : "";
                    const part = unconfirmed ? "/unconfirmed" : "";
                    let query = `${networkPath}v1/blockchain/address${part}/transactions/${address}?mode=verbose&limit=${this.maxPageLength}`;
                    if (params[3] != null) {
                        query = `${query}&page=${params[3] + 1}`;
                    }

                    return query;
                };
            };
            return [createQueryComposerGenerator(false), createQueryComposerGenerator(true)];
        })(),
        changeQueryParametersForPageNumber: function(params, previousResponse, pageNumber) {
            if (!previousResponse || pageNumber === 0) {
                return params;
            }

            return [params[0], params[1], params[2], pageNumber];
        },
        checkWhetherResponseIsForLastPage: function(previousResponse, currentResponse, currentPageNumber) {
            return (currentResponse?.data?.data?.list?.length ?? 0) < this.maxPageLength;
        },
        getDataByResponse: function(response, params) {
            if (response?.data?.data?.list == null) {
                return null;
            }

            const currentBlockNumber = params[2];
            return (response?.data?.data?.list ?? []).map(tx => {
                const mapType = type =>
                    type === "P2WPKH"
                        ? P2WPKH_SCRIPT_TYPE
                        : type === "P2PKH"
                        ? P2PKH_SCRIPT_TYPE
                        : type === "P2SH"
                        ? P2SH_SCRIPT_TYPE
                        : null;
                const inputs = [];
                while (tx.vIn[inputs.length]) {
                    const key = inputs.length + "";
                    inputs.push(
                        new Input(
                            tx.vIn[key].address,
                            tx.vIn[key].amount,
                            tx.vIn[key].txId,
                            tx.vIn[key].vOut,
                            mapType(tx.vIn[key].type),
                            tx.vIn[key].sequence
                        )
                    );
                }

                const outputs = [];
                while (tx.vOut[outputs.length]) {
                    const key = outputs.length + "";
                    outputs.push(
                        new Output(
                            [tx.vOut[key].address],
                            tx.vOut[key].value,
                            mapType(tx.vOut[key].type),
                            tx.vOut[key].spent?.txId,
                            +key
                        )
                    );
                }

                return new Transaction(
                    tx.txId,
                    tx.blockHeight && currentBlockNumber ? currentBlockNumber - tx.blockHeight + 1 : 0,
                    tx.blockHeight ?? 0,
                    tx.timestamp || tx.blockTime,
                    tx.fee,
                    null, // This provider has no such analysis
                    inputs,
                    outputs
                );
            });
        },
    },
    {
        /**
         * API documentation https://btc.com/btc/adapter?type=api-doc.
         * This provider fails to retrieve big transactions.
         */
        maxPageLength: 50,
        timeout: 20000,
        RPS: 0.05,
        endpoint: "https://chain.api.btc.com/v3/address",
        httpMethod: "get",
        composeQueryString: function(params) {
            const address = params[1];
            let query = `/${address}/tx?pagesize=${this.maxPageLength}`;
            if (params[3] != null) {
                query += `&page=${params[3]}`;
            } else {
                query += `&page=0`;
            }

            return query;
        },
        changeQueryParametersForPageNumber: function(params, previousResponse, pageNumber) {
            if (!previousResponse || pageNumber === 0) {
                return params;
            }

            return [params[0], params[1], params[2], pageNumber];
        },
        checkWhetherResponseIsForLastPage: function(previousResponse, currentResponse, currentPageNumber) {
            return (currentResponse?.data?.data?.list?.length ?? 0) < this.maxPageLength;
        },
        getDataByResponse: function(response, params) {
            if (response?.data?.data?.list == null) {
                return null;
            }

            const currentBlockNumber = params[2];
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
                    tx.confirmations && currentBlockNumber ? currentBlockNumber - tx.confirmations + 1 : 0,
                    tx.block_time ?? provideFirstSeenTime(getHash(tx.hash)),
                    tx.fee,
                    tx.is_double_spend,
                    inputs,
                    outputs
                );
            });
        },
    },
];

const externalTransactionsDataAPICaller = new CachedRobustExternalApiCallerService(
    "noBatchTransactionsDataAPICaller",
    noBatchTransactionsProviders,
    20000,
    40,
    1500
);

// TODO: [tests, moderate] add unit tests
export async function performNoBatchTransactionsDataRetrieval(
    addressesList,
    network,
    cancelProcessingHolder,
    addressesUpdateTimestampsVariableParameter,
    maxAttemptsCountToGetDataForEachAddress = 1
) {
    try {
        const currentBlock = currentBlockService.getCurrentBlockHeight();
        const data = await Promise.all(
            addressesList.map(address => {
                if (cancelProcessingHolder == null || !cancelProcessingHolder.isCanceled()) {
                    return externalTransactionsDataAPICaller
                        .callExternalAPICached(
                            [network, address, currentBlock],
                            5000,
                            cancelProcessingHolder && cancelProcessingHolder.getToken(),
                            maxAttemptsCountToGetDataForEachAddress,
                            () => address
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

        // Removing duplicated transactions from retrieved list
        return data
            .flat()
            .reduce(
                (deduplicated, currentTx) =>
                    !deduplicated.find(tx => currentTx.txid === tx.txid) ? [currentTx, ...deduplicated] : deduplicated,
                []
            );
    } catch (e) {
        improveAndRethrow(e, "performNoBatchTransactionsDataRetrieval");
    }
}
