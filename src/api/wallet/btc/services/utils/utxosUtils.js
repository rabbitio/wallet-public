import { improveAndRethrow } from "../../../../common/utils/errorUtils";
import { transactionsDataProvider } from "../internal/transactionsDataProvider";

/**
 * @param internalAddresses {string[]}
 * @param externalAddresses {string[]}
 * @param network {Network}
 * @return {Promise<{internal: Utxo[], external: Utxo[]}>}
 */
export async function getAllUTXOs(internalAddresses, externalAddresses, network) {
    try {
        const allAddresses = [...internalAddresses, ...externalAddresses];
        const utxos = await transactionsDataProvider.getUTXOsByAddressesArray(allAddresses);

        return {
            internal: utxos.filter(utxo => internalAddresses.find(address => address === utxo.address)),
            external: utxos.filter(utxo => externalAddresses.find(address => address === utxo.address)),
        };
    } catch (e) {
        improveAndRethrow(e, "getAllUTXOs");
    }
}
