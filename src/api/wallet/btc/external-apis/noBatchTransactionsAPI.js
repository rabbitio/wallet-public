import {
    improveAndRethrow,
    CachedRobustExternalApiCallerService,
    ExternalApiProvider,
    ApiGroups,
} from "@rabbitio/ui-kit";

import { Input } from "../models/transaction/input.js";
import { Output } from "../models/transaction/output.js";
import { Transaction } from "../models/transaction/transaction.js";
import { provideFirstSeenTime } from "../../common/external-apis/utils/firstSeenTimeHolder.js";
import { getHash } from "../../../common/adapters/crypto-utils.js";
import { currentBlockService } from "../services/internal/currentBlockService.js";
import { Coins } from "../../coins.js";
import { mergeTwoArraysByItemIdFieldName } from "../../common/utils/cacheActualizationUtils.js";
import { mappingsPerProvider } from "./outputTypeMappings.js";
import { STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS } from "../../../common/utils/ttlConstants.js";
import { cache } from "../../../common/utils/cache.js";

// TODO: [feature, moderate] Add blockchyper provider https://api.blockcypher.com/v1/btc/main/addrs/bc1qqdxrd3708yaph7zzjmqumglhxjf6qrvprgm8jn/full task_id=a8370ae7b99049b092f31f761a95b54d
// TODO: [feature, moderate] Add mempool.space provider https://mempool.space/docs/api/rest#post-transaction task_id=a8370ae7b99049b092f31f761a95b54d task_id=a8370ae7b99049b092f31f761a95b54d
/**
 * Params array for each provider should contain exactly 3 parameters:
 *     params[0] {Network} Network object to get transactions for
 *     params[1] {string} address string
 *     params[2] {number} current block number
 */
class BlockstreamNoBatchTransactionsProvider extends ExternalApiProvider {
    constructor() {
        // API documentation https://github.com/Blockstream/esplora/blob/master/API.md
        super("https://blockstream.info/", "get", 20000, ApiGroups.BLOCKSTREAM, {}, 25);
    }

    doesSupportPagination() {
        return true;
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const [network, address] = params;
            const networkPath = network.key === Coins.COINS.BTC.testnet.key ? "testnet/" : "";
            let query = `${networkPath}api/address/${address}/txs`;
            if (params[3]) {
                // For pagination. This parameter should not be passed when using this API - we add this parameter internally
                query = `${query}/chain/${params[3]}`;
            }

            return query;
        } catch (e) {
            improveAndRethrow(e, "BlockstreamNoBatchTransactionsProvider.composeQueryString");
        }
    }
    changeQueryParametersForPageNumber(params, previousResponse, pageNumber, subRequestIndex = 0) {
        try {
            const previousData = previousResponse?.data;
            if (!previousData || !Array.isArray(previousData) || pageNumber === 0) {
                return params;
            }

            return [params[0], params[1], params[2], previousData[previousData?.length - 1].txid];
        } catch (e) {
            improveAndRethrow(e, "BlockstreamNoBatchTransactionsProvider.changeQueryParametersForPageNumber");
        }
    }
    checkWhetherResponseIsForLastPage(previousResponse, currentResponse, currentPageNumber, subRequestIndex = 0) {
        try {
            return (
                currentResponse?.data == null ||
                !Array.isArray(currentResponse.data) ||
                currentResponse.data.filter(tx => tx?.status?.block_height != null).length < this.maxPageLength
            );
        } catch (e) {
            improveAndRethrow(e, "BlockstreamNoBatchTransactionsProvide.checkWhetherResponseIsForLastPager");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            /* NOTE: this provider returns only 50 unconfirmed transactions for the passed address. So it can cause
                 the tricky bugs in rare cases when someone uses the same address and there are a lot of transactions
                 to this address
                 TODO: maybe throw an error to use another provider if we see 50 unconfirmed transactions? or just
                       ignore as eventually we will see all transactions (after the confirmation)
            */
            if (response?.data == null) {
                return null;
            }

            const currentBlockNumber = params[2];
            return (response?.data ?? []).map(tx => {
                const typesMap = mappingsPerProvider.get(ApiGroups.BLOCKSTREAM);
                const inputs = tx.vin.map(input => {
                    const address = input.prevout.scriptpubkey_address;
                    const type = typesMap.get(input.prevout.scriptpubkey_type) ?? null;
                    return new Input(address, input.prevout.value, input.txid, input.vout, type, input.sequence);
                });

                const outputs = tx.vout
                    .map((output, index) => {
                        const outputType = typesMap.get(output.scriptpubkey_type) ?? null;
                        if (outputType == null) return [];
                        return new Output([output.scriptpubkey_address], output.value, outputType, null, index);
                    })
                    .flat();

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
        } catch (e) {
            improveAndRethrow(e, "BlockstreamNoBatchTransactionsProvider.getDataByResponse");
        }
    }
}

/**
 * @deprecated @since 0.10.0 - on 22.09.23 it was figured out that this explorer returns no data
 * TODO: [refactoring, moderate] remove after the scheduled check task_id=fd3c94ece28740b5b401567bb4f77657
 */
// eslint-disable-next-line no-unused-vars
class BitapsNoBatchTransactionsProvider extends ExternalApiProvider {
    constructor() {
        /**
         * API docs https://developer.bitaps.com/blockchain.
         * This API provides separate endpoints for confirmed and unconfirmed transactions.
         * Max transactions per page is 50, but we use 13 as this provider fails to return the whole requested
         * data and cuts it - looks like it has some not-documented data size restrictions.
         */
        super("https://api.bitaps.com/btc/", ["get", "get"], 20000, ApiGroups.BITAPS, {}, 13);
    }

    doesSupportPagination() {
        return true;
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const [network, address] = params;
            const networkPath = network.key === Coins.COINS.BTC.testnet.key ? "testnet/" : "";
            const part = subRequestIndex === 1 ? "/unconfirmed" : "";
            let query = `${networkPath}v1/blockchain/address${part}/transactions/${address}?mode=verbose&limit=${this.maxPageLength}`;
            if (params[3] != null) {
                query = `${query}&page=${params[3] + 1}`;
            }

            return query;
        } catch (e) {
            improveAndRethrow(e, "BitapsNoBatchTransactionsProvider.composeQueryString");
        }
    }

    changeQueryParametersForPageNumber(params, previousResponse, pageNumber, subRequestIndex = 0) {
        try {
            if (!previousResponse || pageNumber === 0) {
                return params;
            }

            return [params[0], params[1], params[2], pageNumber];
        } catch (e) {
            improveAndRethrow(e, "BitapsNoBatchTransactionsProvider.changeQueryParametersForPageNumber");
        }
    }

    checkWhetherResponseIsForLastPage(previousResponse, currentResponse, currentPageNumber, subRequestIndex = 0) {
        try {
            return (currentResponse?.data?.data?.list?.length ?? 0) < this.maxPageLength;
        } catch (e) {
            improveAndRethrow(e, "BitapsNoBatchTransactionsProvider.checkWhetherResponseIsForLastPage");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            if (response?.data?.data?.list == null) {
                return null;
            }

            const currentBlockNumber = params[2];
            return (response?.data?.data?.list ?? []).map(tx => {
                const typesMap = mappingsPerProvider.get(ApiGroups.BITAPS);
                const inputs = [];
                while (tx.vIn[inputs.length]) {
                    const key = inputs.length + "";
                    const address = tx.vIn[key].address;
                    const amount = tx.vIn[key].amount;
                    const id = tx.vIn[key].txId;
                    const type = typesMap.get(tx.vIn[key].type) ?? null;
                    inputs.push(new Input(address, amount, id, tx.vIn[key].vOut, type, tx.vIn[key].sequence));
                }

                const outputs = [];
                let index = 0;
                while (tx.vOut[index]) {
                    const output = tx.vOut[index];
                    index++;
                    const type = typesMap.get(output.type) ?? null;
                    if (type) {
                        // We treat only supported output types
                        outputs.push(new Output([output.address], output.value, type, output.spent?.txId, index - 1));
                    }
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
        } catch (e) {
            improveAndRethrow(e, "BitapsNoBatchTransactionsProvider.getDataByResponse");
        }
    }
}

class BtcDotComNoBatchTransactionsProvider extends ExternalApiProvider {
    constructor() {
        /**
         * API documentation https://btc.com/btc/adapter?type=api-doc.
         * NOTE: This provider fails to retrieve big transactions.
         */
        super("https://chain.api.btc.com/v3/address", "get", 40000, ApiGroups.BTCCOM, {}, 50);
    }

    doesSupportPagination() {
        return true;
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const address = params[1];
            let query = `/${address}/tx?pagesize=${this.maxPageLength}`;
            if (params[3] != null) {
                query += `&page=${params[3]}`;
            } else {
                query += `&page=0`;
            }

            return query;
        } catch (e) {
            improveAndRethrow(e, "BtcDotComNoBatchTransactionsProvider.composeQueryString");
        }
    }
    changeQueryParametersForPageNumber(params, previousResponse, pageNumber, subRequestIndex = 0) {
        try {
            if (!previousResponse || pageNumber === 0) {
                return params;
            }

            return [params[0], params[1], params[2], pageNumber];
        } catch (e) {
            improveAndRethrow(e, "BtcDotComNoBatchTransactionsProvider.changeQueryParametersForPageNumber");
        }
    }
    checkWhetherResponseIsForLastPage(previousResponse, currentResponse, currentPageNumber, subRequestIndex = 0) {
        try {
            return (currentResponse?.data?.data?.list?.length ?? 0) < this.maxPageLength;
        } catch (e) {
            improveAndRethrow(e, "BtcDotComNoBatchTransactionsProvider.checkWhetherResponseIsForLastPage");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            if (response?.data?.data?.list == null) {
                return null;
            }

            const currentBlockNumber = params[2];
            return (response?.data?.data?.list ?? []).map(tx => {
                const typesMap = mappingsPerProvider.get(ApiGroups.BTCCOM);
                const inputs = tx.inputs.map(input => {
                    const address = input.prev_addresses[0];
                    const id = input.prev_tx_hash;
                    const type = typesMap.get(input.prev_type) ?? null;
                    return new Input(address, input.prev_value, id, input.prev_position, type, input.sequence);
                });

                const outputs = tx.outputs
                    .map((output, index) => {
                        const outputType = typesMap.get(output.type) ?? null;
                        if (outputType == null) return [];
                        const spendId = output.spent_by_tx || null;
                        return new Output(output.addresses, output.value, outputType, spendId, index);
                    })
                    .flat();

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
        } catch (e) {
            improveAndRethrow(e, "BtcDotComNoBatchTransactionsProvider.getDataByResponse");
        }
    }
}

export const noBatchTransactionsProviders = [
    new BlockstreamNoBatchTransactionsProvider(),
    // new BitapsNoBatchTransactionsProvider(),
    new BtcDotComNoBatchTransactionsProvider(),
];

const externalTransactionsDataAPICaller = new CachedRobustExternalApiCallerService(
    "noBatchTransactionsDataAPICaller",
    cache,
    noBatchTransactionsProviders,
    STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS,
    false,
    (cachedList, newList) => mergeTwoArraysByItemIdFieldName(cachedList, newList, "txid")
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
                            15000,
                            cancelProcessingHolder && cancelProcessingHolder.getToken(),
                            maxAttemptsCountToGetDataForEachAddress,
                            () => `no_batch_txs_list_btc_${address}`,
                            true
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
            .filter(tx => tx?.txid)
            .reduce(
                (deduplicated, currentTx) =>
                    !deduplicated.find(tx => currentTx.txid === tx.txid) ? [currentTx, ...deduplicated] : deduplicated,
                []
            );
    } catch (e) {
        improveAndRethrow(e, "performNoBatchTransactionsDataRetrieval");
    }
}
