import { Input } from "../models/transaction/input";
import { Output } from "../models/transaction/output";
import { Transaction } from "../models/transaction/transaction";
import { ExternalBlocksApiCaller } from "./blocksAPI";
import RobustExternalAPICallerService from "../../../common/services/utils/robustExteranlApiCallerService/robustExternalAPICallerService";
import { Coins } from "../../coins";
import { provideFirstSeenTime } from "../../common/external-apis/utils/firstSeenTimeHolder";
import { getHash } from "../../../common/adapters/crypto-utils";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { getOutputTypeByAddress } from "../lib/utxos";
import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { ApiGroups } from "../../../common/external-apis/apiGroups";

const mappingOfTxIndexesToHashes = new Map();

class BlockchainComBatchBtcTransactionsProvider extends ExternalApiProvider {
    constructor() {
        super("https://blockchain.info/multiaddr", "get", 15000, ApiGroups.BLOCKCHAIN_INFO, {}, 100);
    }

    composeQueryString(params) {
        const [network, addresses, offset] = params;
        if (network !== Coins.COINS.BTC.mainnet) {
            throw new Error("Blockchain.com doesn't support testnet. DEV: no-batch txs providers had to be used");
        }

        return `?n=${this.maxPageLength}&offset=${offset}&cors=true&active=${(addresses ?? []).join(",")}`;
    }

    getDataByResponse(response, params, subRequestIndex = 0, iterationsData = []) {
        const currentBlockNumber = params[3];
        return (response?.data?.txs ?? []).map(tx => {
            const inputs = tx.inputs.map(
                input =>
                    new Input(
                        input.prev_out.addr,
                        input.prev_out.value,
                        input.prev_out?.tx_index, // txid is not provided by blockchain.com
                        input.prev_out.n,
                        getOutputTypeByAddress(input.prev_out.addr), // TODO: [feature, high] use UNKNOWN output type. task_id=a12a2be006544920b1273b8c2bc5561f
                        input.sequence
                    )
            );

            const outputs = tx.out
                .map(
                    output =>
                        output.addr
                            ? new Output(
                                  [output.addr],
                                  output.value,
                                  getOutputTypeByAddress(output.addr), // TODO: [feature, high] use UNKNOWN output type. task_id=a12a2be006544920b1273b8c2bc5561f
                                  output?.spending_outpoints ? output?.spending_outpoints[0]?.tx_index : null, // txid is not provided by blockchain.com, so we use tx_index as it is not critical
                                  output.n
                              )
                            : [] // For outputs having no address like OP_RETURN outputs
                )
                .flat();

            mappingOfTxIndexesToHashes.set(tx.tx_index, tx.hash);

            return new Transaction(
                tx.hash,
                tx.block_height ? currentBlockNumber - tx.block_height + 1 : 0,
                tx.block_height ?? 0,
                tx?.time || provideFirstSeenTime(getHash(tx.hash)),
                tx.fee,
                tx.double_spend,
                inputs,
                outputs
            );
        });
    }

    doesSupportPagination() {
        return true;
    }

    changeQueryParametersForPageNumber(params, previousResponse, pageNumber, subRequestIndex = 0) {
        return composeParametersArray(params[0], params[1], this.maxPageLength * pageNumber, params[3]);
    }

    checkWhetherResponseIsForLastPage(previousResponse, currentResponse, currentPageNumber, subRequestIndex = 0) {
        return (currentResponse?.data?.txs?.length ?? 0) < this.maxPageLength;
    }
}

/**
 * Composes the params array. This function is needed just to declaare the params array format.
 *
 * @param network {Network} Network object to get transactions for
 * @param addresses {Array<string>} array of addresses
 * @param offset {number} to get not first transactions but the ones starting from this number
 * @param currentBlocksCount {number} current block count
 */
function composeParametersArray(network, addresses, offset, currentBlocksCount) {
    return [network, addresses, offset, currentBlocksCount];
}

export const externalBatchTransactionsDataAPICaller = new RobustExternalAPICallerService(
    "batchBtcTransactionsDataRetriever",
    [new BlockchainComBatchBtcTransactionsProvider()]
);

export async function performBatchTransactionsDataRetrieval(
    addressesList,
    network,
    cancelProcessingHolder,
    addressesUpdateTimestampsVariableParameter,
    addressesCountPerBatch = 20
) {
    try {
        const currentBlock = await ExternalBlocksApiCaller.retrieveCurrentBlockNumber(
            network,
            cancelProcessingHolder && cancelProcessingHolder.getToken()
        );
        let addressesBatches = [];
        let j = 0;
        for (let i = 0; i < addressesList.length; ++i) {
            if ((addressesBatches[j]?.length ?? 0) >= addressesCountPerBatch) {
                ++j;
            }

            if (addressesBatches[j]) {
                addressesBatches[j].push(addressesList[i]);
            } else {
                addressesBatches[j] = [addressesList[i]];
            }
        }

        let resultsPromisesPerAddressesBatch = [];
        for (let i = 0; i < addressesBatches.length; ++i) {
            let batchPromise = null;
            if (cancelProcessingHolder == null || !cancelProcessingHolder.isCanceled()) {
                const resultForBatch = externalBatchTransactionsDataAPICaller
                    .callExternalAPI(
                        composeParametersArray(network, addressesBatches[i], 0, currentBlock),
                        25000,
                        cancelProcessingHolder && cancelProcessingHolder.getToken(),
                        2
                    )
                    .then(result => {
                        Array.isArray(result?.txs) &&
                            addressesBatches[i].forEach(address =>
                                addressesUpdateTimestampsVariableParameter.push({
                                    address,
                                    timestamp: Date.now(),
                                })
                            );
                        return result;
                    })
                    .catch(e => {
                        throw e;
                    });

                batchPromise = resultForBatch;
            } else {
                batchPromise = new Promise(resolve => resolve([]));
            }
            resultsPromisesPerAddressesBatch.push(batchPromise);
        }

        const resultsPerAddressesBatch = await Promise.all(resultsPromisesPerAddressesBatch);

        // Removing duplicated transactions from retrieved list and aggregating all inputs and outputs of the same transaction as blockchain.info returns only inputs and outputs for requested address
        const deduplicated = [];
        resultsPerAddressesBatch.flat().forEach(tx => {
            const duplicate = deduplicated.find(txDeduplicated => tx.txid === txDeduplicated.txid);
            if (duplicate) {
                const missingInputs = tx.inputs.filter(
                    input =>
                        !duplicate.inputs.find(
                            dInput => dInput.txid === input.txid && dInput.output_number === input.output_number
                        )
                );

                const missingOutputs = tx.outputs.filter(
                    output => !duplicate.outputs.find(dOutput => dOutput.number === output.number)
                );

                if (missingInputs.length) {
                    duplicate.inputs = [...duplicate.inputs, ...missingInputs];
                }

                if (missingOutputs.length) {
                    duplicate.outputs = [...duplicate.outputs, ...missingOutputs];
                }
            } else {
                deduplicated.push(tx);
            }
        });

        // setting tx id hash instead of index where possible
        for (const txIndex of mappingOfTxIndexesToHashes.keys()) {
            const txHash = mappingOfTxIndexesToHashes.get(txIndex);
            if (txHash) {
                deduplicated.forEach(tx => {
                    for (let k = 0; k < tx.inputs.length; ++k) {
                        if (+tx.inputs[k].txid === txIndex) {
                            tx.inputs[k].txid = txHash;
                        }
                    }
                    for (let k = 0; k < tx.outputs.length; ++k) {
                        if (+tx.outputs[k].spend_txid === txIndex) {
                            tx.outputs[k].spend_txid = txHash;
                        }
                    }
                });
            }
        }

        return deduplicated;
    } catch (e) {
        improveAndRethrow(e, "performBatchTransactionsDataRetrieval");
    }
}
