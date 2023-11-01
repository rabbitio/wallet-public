import { Input } from "../models/transaction/input";
import { Output } from "../models/transaction/output";
import { Transaction } from "../models/transaction/transaction";
import { getHash } from "../../../common/adapters/crypto-utils";
import { provideFirstSeenTime } from "../../common/external-apis/utils/firstSeenTimeHolder";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { ExternalBlocksApiCaller } from "./blocksAPI";
import { Coins } from "../../coins";
import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";
import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { ApiGroups } from "../../../common/external-apis/apiGroups";
import { mappingsPerProvider } from "./outputTypeMappings";
import { STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS } from "../../../common/utils/ttlConstants";

// TODO: [feature, moderate] Add mempool.space provider https://mempool.space/docs/api/rest#get-transaction task_id=a8370ae7b99049b092f31f761a95b54d
class BlockstreamTransactionDetailsProvider extends ExternalApiProvider {
    constructor() {
        super("https://blockstream.info/", "get", 15000, ApiGroups.BLOCKSTREAM);
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const network = params[0];
            const txid = params[1];
            const networkPath = network.key === Coins.COINS.BTC.testnet.key ? "testnet/" : "";
            return `${networkPath}api/tx/${txid}`;
        } catch (e) {
            improveAndRethrow(e, "blockstreamTransactionDetailsProvider.composeQueryString");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            const currentBlockNumber = params[2];
            const tx = response.data;
            const typesMap = mappingsPerProvider.get(ApiGroups.BLOCKSTREAM);
            const inputs = tx.vin.map(
                input =>
                    new Input(
                        input.prevout.scriptpubkey_address,
                        input.prevout.value,
                        input.txid,
                        input.vout,
                        typesMap.get(input.prevout.scriptpubkey_type) ?? null,
                        input.sequence
                    )
            );

            const outputs = tx.vout.map(
                (output, index) =>
                    new Output(
                        [output.scriptpubkey_address],
                        output.value,
                        typesMap.get(output.scriptpubkey_type) ?? null,
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
        } catch (e) {
            improveAndRethrow(e, "blockstreamTransactionDetailsProvider.getDataByResponse", "tx details");
        }
    }
}

/**
 * @deprecated @since 0.10.0 - on 22.09.23 it was figured out that this explorer returns no data
 * TODO: [refactoring, moderate] remove after the scheduled check task_id=fd3c94ece28740b5b401567bb4f77657
 */
// eslint-disable-next-line no-unused-vars
class BitapsTransactionDetailsProvider extends ExternalApiProvider {
    constructor() {
        /**
         * API docs https://developer.bitaps.com/blockchain
         */
        super("https://api.bitaps.com/btc/", "get", 10000, ApiGroups.BITAPS);
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const [network, txid] = params;
            const networkPath = network.key === Coins.COINS.BTC.testnet.key ? "testnet/" : "";
            return `${networkPath}v1/blockchain/transaction/${txid}`;
        } catch (e) {
            improveAndRethrow(e, "BitapsTransactionDetailsProvider.composeQueryString");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            const currentBlockNumber = params[2];
            const tx = response.data;
            const typesMap = mappingsPerProvider.get(ApiGroups.BITAPS);
            const inputs = Object.keys(tx.vIn).map(inputIndex => {
                const input = tx.vIn[inputIndex];
                const type = typesMap.get(input.type) ?? null;
                return new Input(input.address, input.amount, input.txId, input.vOut, type, input.sequence);
            });

            const outputs = Object.keys(tx.vOut).map(outputIndex => {
                const output = tx.vOut[outputIndex];
                return new Output(
                    [output.address],
                    output.value,
                    typesMap.get(output.type) ?? null,
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
        } catch (e) {
            improveAndRethrow(e, "BitapsTransactionDetailsProvider.getDataByResponse");
        }
    }
}

class BtcDotComTransactionDetailsProvider extends ExternalApiProvider {
    constructor() {
        super("https://chain.api.btc.com/v3/tx/", "get", 15000, ApiGroups.BTCCOM);
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            return params[1]; // second one is txid
        } catch (e) {
            improveAndRethrow(e, "TransactionDetailsProvider.composeQueryString");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            const tx = response.data.data;
            const typesMap = mappingsPerProvider.get(ApiGroups.BTCCOM);
            const inputs = tx.inputs.map(
                input =>
                    new Input(
                        input.prev_addresses[0],
                        input.prev_value,
                        input.prev_tx_hash,
                        input.prev_position,
                        typesMap.get(input.prev_type) ?? null,
                        input.sequence
                    )
            );

            const outputs = tx.outputs.map((output, index) => {
                const spendId = output.spent_by_tx ?? null;
                return new Output(output.addresses, output.value, typesMap.get(output.type) ?? null, spendId, index);
            });

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
        } catch (e) {
            improveAndRethrow(e, "TransactionDetailsProvider.getDataByResponse");
        }
    }
}

const transactionDataAPICaller = new CachedRobustExternalApiCallerService(
    "transactionDataAPICaller",
    [
        new BlockstreamTransactionDetailsProvider(),
        // new BitapsTransactionDetailsProvider(),
        new BtcDotComTransactionDetailsProvider(),
    ],
    STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS
);

/**
 * Retrieves transaction details by id and network.
 *
 * @param txid {string} id of transaction
 * @param network {Network} network to search for transaction in
 * @return {Promise<Transaction|null>} null if not found
 */
export async function retrieveTransactionData(txid, network) {
    try {
        const currentBlock = await ExternalBlocksApiCaller.retrieveCurrentBlockNumber(network);
        return await transactionDataAPICaller.callExternalAPICached(
            [network, txid, currentBlock],
            15000,
            null,
            1,
            () => `btc-tx-details-${txid}`,
            true
        );
    } catch (e) {
        improveAndRethrow(e, "retrieveTransactionData");
    }
}
