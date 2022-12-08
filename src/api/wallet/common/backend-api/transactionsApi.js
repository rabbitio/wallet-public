import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { ApiCallWrongResponseError } from "../../../common/backend-api/utils";
import { doApiCall, urlWithPrefix } from "../../../common/backend-api/utils";
import { Transaction } from "../../btc/models/transaction/transaction";
import { Input } from "../../btc/models/transaction/input";
import { Output } from "../../btc/models/transaction/output";

/**
 * Provides backend API wrappers to save/get transactions on/from server.
 * It is needed to avoid retrieving transactions from external sources when the app is initialized as it can be
 * time-consuming.
 */
export default class TransactionsApi {
    static async saveTransactions(transactions) {
        try {
            if (transactions.find(tx => (tx.confirmations || 0) < 1)) {
                throw new Error("Storing unconfirmed transactions is not supported.");
            }

            const endpoint = `${urlWithPrefix}/transactions`;
            return await doApiCall(endpoint, "post", { transactions }, 201, "Failed to save transactions. ");
        } catch (e) {
            improveAndRethrow(e, "saveTransactions");
        }
    }

    static async getTransactionsByAddresses(addresses, currentBlockHeight) {
        try {
            const endpoint = `${urlWithPrefix}/transactions/get`;
            const transactions = await doApiCall(endpoint, "post", { addresses }, 200, "Failed to get transactions. ");

            return transactions.map(
                txData =>
                    new Transaction(
                        txData.txid,
                        currentBlockHeight - txData.block_height + 1,
                        txData.block_height,
                        Math.floor(txData.time / 1000),
                        txData.fee,
                        false,
                        txData.inputs.map(
                            i => new Input(i.address, i.value_satoshis, i.txid, i.output_number, i.type, i.sequence)
                        ),
                        txData.outputs.map(o => new Output(o.addresses, o.value_satoshis, o.type, null, o.number))
                    )
            );
        } catch (e) {
            if (e instanceof ApiCallWrongResponseError && e.isNotFoundError()) {
                return [];
            }

            improveAndRethrow(e, "getTransactionsByAddresses");
        }
    }
}
