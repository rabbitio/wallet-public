import { getLogger } from "log4js";
import { improveAndRethrow } from "../utils/utils";
import { dbConnectionHolder } from "../utils/dbConnectionHolder";
import { isFindAndUpdateOneResultValid } from "./mongoUtil";

const log = getLogger("transactionsService");

(async () => {
    try {
        (await dbConnectionHolder.getCollection(TransactionsService._collectionName)).createIndex({
            "i.a": 1,
            "o.a": 1,
        });
        log.debug("Index for transactions collection has been created");
    } catch (e) {
        log.error("Failed to create index for addresses", e);
    }
})();

export default class TransactionsService {
    static _collectionName = "transactions";

    static _OUTPUT_TYPES = {
        witness_v0_keyhash: 0,
        pubkeyhash: 1,
        scripthash: 2,
    };

    static async saveTransactions(transactions) {
        log.debug("Start saving transactions");
        try {
            const transactionsCollection = await dbConnectionHolder.getCollection(this._collectionName);

            for (let i = 0; i < transactions.length; ++i) {
                try {
                    // We use single letters as field name to reduce memory footprint as this collection will have hundreds of thousands of documents
                    const document = {
                        h: transactions[i].txid,
                        b: transactions[i].block_height,
                        t: transactions[i].time,
                        f: transactions[i].fee_satoshis,
                        i: transactions[i].inputs.map(input => ({
                            h: input.txid,
                            a: input.address,
                            v: input.value_satoshis,
                            n: input.output_number,
                            s: input.sequence,
                        })),
                        o: transactions[i].outputs.map(output => ({
                            a: output.addresses,
                            v: output.value_satoshis,
                            t: this._OUTPUT_TYPES[output.type],
                            n: output.number,
                        })),
                    };
                    const findOneAndUpdateResult = await transactionsCollection.findOneAndUpdate(
                        { h: transactions[i].txid },
                        { $setOnInsert: document },
                        { new: true, upsert: true }
                    );
                    if (!isFindAndUpdateOneResultValid(findOneAndUpdateResult, false)) {
                        log.error(
                            `Failed to store transactions with ID ${transactions[i].txid}transactions - result is not valid. ${findOneAndUpdateResult}`
                        );
                    }
                } catch (e) {
                    log.error(`Failed to store transactions with ID ${transactions[i].txid} due to internal error`, e);
                }
            }
        } catch (e) {
            improveAndRethrow(e, "saveTransactions");
        }
    }

    static async getTransactions(addresses) {
        try {
            const transactionsCollection = await dbConnectionHolder.getCollection(this._collectionName);
            const result = await transactionsCollection
                .find({
                    $or: [
                        { i: { $elemMatch: { a: { $in: addresses } } } },
                        { o: { $elemMatch: { a: { $elemMatch: { $in: addresses } } } } },
                    ],
                })
                .toArray();

            return result.map(document => ({
                txid: document.h,
                block_height: document.b,
                time: document.t,
                fee_satoshis: document.f,
                inputs: document.i.map(input => ({
                    txid: input.h,
                    address: input.a,
                    value_satoshis: input.v,
                    output_number: input.n,
                    sequence: input.s,
                })),
                outputs: document.o.map(output => ({
                    addresses: output.a,
                    value_satoshis: output.v,
                    type: Object.entries(this._OUTPUT_TYPES).find(entry => entry[1] === output.t)[0],
                    number: output.n,
                })),
            }));
        } catch (e) {
            improveAndRethrow(e, "getTransactions");
        }
    }
}
