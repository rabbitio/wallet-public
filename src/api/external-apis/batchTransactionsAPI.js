// import RobustExternalAPICallerService from "../utils/robustExternalAPICallerService";
// import { mainnet } from "../lib/networks";
// // import { P2PKH_SCRIPT_TYPE, P2SH_SCRIPT_TYPE, P2WPKH_SCRIPT_TYPE } from "../lib/utxos";
// import { Input } from "../models/transaction/input";
// import { Output } from "../models/transaction/output";
// import { Transaction } from "../models/transaction/transaction";
// import { provideFirstSeenTime } from "./utils/firstSeenTimeHolder";
// import { getHash } from "../adapters/crypto-utils";
// import { improveAndRethrow } from "../utils/errorUtils";
// import { externalBlocksAPICaller } from "./blocksAPI";
//
// /**
//  * TODO: [feature, low] Batch transactions retrieval can speed the application up significantly but currently
//  *       blockchain.com doesn't provide the txid (hash) for inputs and outputs and this makes it unusable. We need to
//  *       check the status periodically and return to implement this feature as soon as the blockchain.com start to
//  *       provide adequate data.
//  * TODO: [feature, low] The implementation is not finished
//  */
// /**
//  * params array should contain:
//  *     params[0] {Network} - Network object to get transactions for
//  *     params[1] {Array<string>} - array of addresses
//  *     params[2] {number} - to get not first transactions but the ones starting from this number
//  *     params[3] {number} - max transactions count per request (not more than 100)
//  *     params[4] {number} - current block count
//  * @type {RobustExternalAPICallerService}
//  */
// const externalBatchTransactionsDataAPICaller = new RobustExternalAPICallerService("", [
//     {
//         timeout: 10000,
//         RPS: 10,
//         endpoint: "https://blockchain.info/multiaddr",
//         httpMethod: "get",
//         composeQueryString: params => {
//             const [network, addresses, offset, maxTxsPerRequest] = params;
//             if (network.key !== mainnet.key) {
//                 throw new Error("Blockchain.com doesn't support bitcoin testnet. DEV: use no-batch txs providers");
//             }
//
//             if (maxTxsPerRequest > 100) {
//                 throw new Error(
//                     `Blockchain.com doesn't support more than 100 txs per request but the parameter: ${maxTxsPerRequest}`
//                 );
//             }
//
//             return `?n=${maxTxsPerRequest}&offset=${offset}&cors=true&active=${(addresses ?? []).join(",")}`;
//         },
//         getDataByResponse: (response, params) => {
//             const currentBlockNumber = params[3];
//             return (response?.data?.txs ?? []).map(tx => {
//                 // const mapType = type =>
//                 //     type === "v0_p2wpkh" ? P2WPKH_SCRIPT_TYPE : type === "p2pkh" ? P2PKH_SCRIPT_TYPE : P2SH_SCRIPT_TYPE;
//                 const inputs = tx.inputs.map(
//                     input =>
//                         new Input(
//                             input.prev_out.addr,
//                             input.prev_out.value,
//                             // input.txid, // txid is not provided by blockchain.com
//                             input.prev_out.n,
//                             // mapType(input.prev_out.scriptpubkey_type), // is not provided by blockchain.com
//                             input.sequence
//                         )
//                 );
//
//                 const outputs = tx.out.map(
//                     output =>
//                         new Output(
//                             [output.addr],
//                             output.value,
//                             // mapType(output.scriptpubkey_type), // is not provided by blockchain.com
//                             // output?.spending_outpoints?.tx_index, // txid is not provided by blockchain.com
//                             output.n
//                         )
//                 );
//
//                 return new Transaction(
//                     tx.hash,
//                     tx.block_height ? currentBlockNumber - tx.block_height + 1 : 0,
//                     tx.block_height ?? 0,
//                     tx?.status.block_time || provideFirstSeenTime(getHash(tx.hash)),
//                     tx.fee,
//                     tx.double_spend,
//                     inputs,
//                     outputs
//                 );
//             });
//         },
//     },
// ]);
//
// export async function performBatchTransactionsDataRetrieval(
//     addressesList,
//     network,
//     cancelProcessingHolder,
//     addressesUpdateTimestampsVariableParameter,
//     maxAttemptsCountToGetDataForEachAddress = 1
// ) {
//     const ADDRESSES_PER_BATCH = 20;
//     const MAX_TXS_PER_REQUEST = 100;
//     try {
//         const currentBlock = await externalBlocksAPICaller.callExternalAPI([network], 6000);
//         const txs = [];
//         const addressesBatches = addressesList.reduce((prev, cur, curIndex) => {
//             const indexOfSubArray = Math.floor(curIndex / ADDRESSES_PER_BATCH);
//             !prev[indexOfSubArray] && (prev[indexOfSubArray] = []);
//             prev[indexOfSubArray].push(cur);
//             return prev;
//         }, []);
//
//         let resultsPerAddressesBatch = [];
//         let pageNumber = 1;
//         do {
//             resultsPerAddressesBatch = await Promise.all(
//                 addressesBatches.map((addressesBatch, index) => {
//                     if (resultsPerAddressesBatch[index] && !resultsPerAddressesBatch[index].isLastPage) {
//                         if (cancelProcessingHolder == null || !cancelProcessingHolder.isCanceled()) {
//                             const resultForBatch = externalBatchTransactionsDataAPICaller
//                                 .callExternalAPI(
//                                     [network, addressesBatch, MAX_TXS_PER_REQUEST, currentBlock],
//                                     7000,
//                                     cancelProcessingHolder
//                                 )
//                                 .then(result => {
//                                     Array.isArray(result?.txs) &&
//                                         addressesBatch.forEach(address =>
//                                             addressesUpdateTimestampsVariableParameter.push({
//                                                 address,
//                                                 timestamp: Date.now(),
//                                             })
//                                         );
//                                     return result;
//                                 });
//
//                             return { txs: resultForBatch.txs, isLastPage: false /*check*/, pageNumber };
//                         }
//
//                         return new Promise(resolve => resolve({ txs: [], isLastPage: true, pageNumber }));
//                     }
//
//                     return new Promise(resolve => resolve(resultsPerAddressesBatch[index]));
//                 })
//             );
//             pageNumber++;
//         } while (resultsPerAddressesBatch.find(item => !item.isLastPage));
//
//         // Removing duplicated transactions from retrieved list
//         return txs
//             .flat()
//             .reduce(
//                 (deduplicated, currentTx) =>
//                     !deduplicated.find(tx => currentTx.txid === tx.txid) ? [currentTx, ...deduplicated] : deduplicated,
//                 []
//             );
//     } catch (e) {
//         improveAndRethrow(e, "performBatchTransactionsDataRetrieval");
//     }
// }
