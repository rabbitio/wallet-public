import { BtcTransactionPushingProvider } from "../../external-apis/btcTransactionPushingProvider";
import { improveAndRethrow } from "../../../../common/utils/errorUtils";
import { Logger } from "../../../../support/services/internal/logs/logger";

/**
 * Converts given bitcoinjs transaction object to HEX interpretation and
 * broadcasts it via Explorer's API.
 *
 * TODO: [refactoring, low] Pass hex string here, not a bitcoinjs object
 * @param transaction {object} bitcoinjs transaction object to be published
 * @param network {Network} to broadcast transaction to
 * @returns {Promise<string>} transaction ID string
 * @throws wrapper-error with specific message if any error is caught
 */
export async function broadcastTransaction(transaction, network) {
    const loggerSource = "broadcastTransaction";
    try {
        Logger.log("Start broadcasting the transaction", loggerSource);
        const hexTransaction = transaction.toHex();
        const id = await BtcTransactionPushingProvider.pushRawHexBtcTransaction(hexTransaction, network);

        Logger.log(`Transaction pushed successfully: ${id}`, loggerSource);
        return id;
    } catch (e) {
        // TODO: [feature, medium] Parse at least popular broadcasting errors like min relay fee not matched, dust sending etc
        improveAndRethrow(e, loggerSource);
    }
}
