import { postTransactionAPICaller } from "../../external-apis/postTransactionAPI";
import { improveAndRethrow } from "../../utils/errorUtils";

/**
 * Converts given bitcoinjs transaction object to HEX interpretation and
 * broadcasts it via Explorer's API.
 *
 * TODO: [refactoring, low] Pass hex string here, not a bitcoinjs object
 * @param transaction - bitcoinjs transaction object to be broadcasted
 * @param network - network to broadcast transaction to
 * @returns Promise resolving to transaction ID string
 * @throws wrapper-error with specific message if any error is caught
 */
export async function broadcastTransaction(transaction, network) {
    try {
        const hexTransaction = transaction.toHex();
        return await postTransactionAPICaller.callExternalAPI([hexTransaction, network], 30000);
    } catch (e) {
        // TODO: [feature, medium] Parse at least popular broadcasting errors like min relay fee not matched, dust sending etc
        improveAndRethrow(e, "broadcastTransaction");
    }
}
