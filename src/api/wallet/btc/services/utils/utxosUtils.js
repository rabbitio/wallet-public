import { improveAndRethrow } from "../../../../common/utils/errorUtils";
import { transactionsDataProvider } from "../internal/transactionsDataProvider";
import { getTXIDSendingGivenOutput } from "../../lib/utxos";
import { Utxo } from "../../models/transaction/utxo";

/**
 * @param internalAddresses {string[]}
 * @param externalAddresses {string[]}
 * @param network {Network}
 * @return {Promise<{internal: Utxo[], external: Utxo[]}>}
 */
export async function getAllUTXOs(internalAddresses, externalAddresses, network) {
    try {
        const allAddresses = [...internalAddresses, ...externalAddresses];
        const utxos = await getUTXOsByAddressesArray(allAddresses);

        return {
            internal: utxos.filter(utxo => internalAddresses.find(address => address === utxo.address)),
            external: utxos.filter(utxo => externalAddresses.find(address => address === utxo.address)),
        };
    } catch (e) {
        improveAndRethrow(e, "getAllUTXOs");
    }
}

/**
 * Calculates a set of UTXOs by given addresses
 *
 * @param addresses {string[]} addresses set to get UTXO's for
 * @return {Promise<Utxo[]>} returns array of Output objects
 */
async function getUTXOsByAddressesArray(addresses) {
    try {
        const transactionsData = await transactionsDataProvider.getTransactionsByAddresses(addresses);
        const outputsData = addresses.map(address => {
            const scannedTxs = [];
            const outputs = transactionsData.map(tx => {
                if (
                    (tx.double_spend && !(tx.confirmations > 0) && !tx.is_most_probable_double_spend) ||
                    scannedTxs.includes(tx.txid)
                )
                    return [];
                scannedTxs.push(tx.txid);

                const matchedOutputs = tx.outputs.filter(output => output.addresses.includes(address));
                return matchedOutputs
                    .filter(
                        output =>
                            output.spend_txid == null && // Double check as some providers gives no data about txs spending
                            getTXIDSendingGivenOutput(output, tx.txid, transactionsData) == null
                    )
                    .map(
                        output =>
                            new Utxo(
                                tx.txid,
                                output.number,
                                output.value_satoshis,
                                tx.confirmations,
                                output.type,
                                output.addresses[0]
                            )
                    );
            });
            return outputs.flat();
        });
        return outputsData
            .flat()
            .map(d => new Utxo(d.txid, d.number, d.value_satoshis, d.confirmations, d.type, d.address));
    } catch (e) {
        improveAndRethrow(e, "getUTXOsByAddressesArray");
    }
}
