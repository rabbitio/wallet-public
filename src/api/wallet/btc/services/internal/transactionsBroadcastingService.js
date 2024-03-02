import { improveAndRethrow } from "@rabbitio/ui-kit";

import { BtcTransactionPushingProvider } from "../../external-apis/btcTransactionPushingProvider.js";
import { Logger } from "../../../../support/services/internal/logs/logger.js";

export class BtcTransactionBroadcastingService {
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
    static async broadcastTransaction(transaction, network) {
        const loggerSource = "broadcastTransaction";
        try {
            Logger.log("Start broadcasting the transaction", loggerSource);
            const hexTransaction = transaction.toHex();
            const id = await BtcTransactionPushingProvider.pushRawHexBtcTransaction(hexTransaction, network);

            Logger.log(`Transaction pushed successfully: ${id}`, loggerSource);
            return id;
        } catch (e) {
            // TODO: [feature, high] Parse at least popular broadcasting errors like min relay fee not matched, dust sending etc task_id=46a3e279791f49f1a2137949711590af
            improveAndRethrow(e, loggerSource);
        }
    }
}
