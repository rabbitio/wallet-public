import { Transaction } from "../../models/transaction/transaction";
import { Input } from "../../models/transaction/input";
import { Output } from "../../models/transaction/output";
import { getOutputTypeByAddress } from "../../lib/utxos";
import { MAX_RBF_SEQUENCE } from "../../lib/transactions/build-transaction";

export function txDataToTransaction(txData, txId, confirmations, height, timestampMs) {
    return new Transaction(
        txId,
        confirmations,
        height,
        Math.round(timestampMs / 1000),
        txData.utxos.reduce((prev, utxo) => prev + utxo.value_satoshis, 0) - txData.amount - txData.change,
        null,
        txData.utxos.map(
            utxo => new Input(utxo.address, utxo.value_satoshis, utxo.txid, utxo.number, utxo.type, MAX_RBF_SEQUENCE)
        ),
        [
            new Output([txData.address], txData.amount, getOutputTypeByAddress(txData.address), null, 0),
            ...(txData.change > 0
                ? [
                      new Output(
                          [txData.changeAddress],
                          txData.change,
                          getOutputTypeByAddress(txData.changeAddress),
                          null,
                          1
                      ),
                  ]
                : []),
        ]
    );
}
