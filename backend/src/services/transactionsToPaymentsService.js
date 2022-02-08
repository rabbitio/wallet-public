import { getLogger } from "log4js";
import { dbConnectionHolder } from "../utils/dbConnectionHolder";
import { isFindAndUpdateOneResultValid } from "./mongoUtil";
import { improveAndRethrow } from "../utils/utils";

const log = getLogger("transactionsToPaymentsService");

export default class TransactionsToPaymentsService {
    static documentName = "transactionsToPaymentsMapping";
    static STATUSES = { SUCCESS: { id: "SUCCESS", number: 0 }, ERROR: { id: "ERROR", number: 1 } };

    /**
     * Saves or updates transaction to payment mapping. If the item not exist then just saves it with
     * the only status passed and current timestamp for it. If the item already exist then adds (updates)
     * transactionId and adds passed status with current timestamp to statuses array.
     *
     * @param transactionId {string} - id of transaction related to paymentId, can be null if not yet present
     * @param paymentId {string} - id of payment
     * @param provider {string} - id of provider processing the payment
     * @param status {Object} - new status of the payment
     * @param amount {number} - amount
     * @param currencyCode {string} - currency code
     * @return {Promise<void>}
     */
    static async saveTransactionToPaymentMapping(
        paymentId,
        provider,
        status,
        transactionId = null,
        amount,
        currencyCode
    ) {
        try {
            log.debug(`Start saving transaction to payment mapping ${paymentId}`);

            const collection = await dbConnectionHolder.getCollection(this.documentName);
            const updateObject = {
                $set: {
                    id: paymentId,
                    p: provider,
                    a: amount,
                    c: currencyCode,
                },
                $push: { s: [status.number, Date.now()] },
            };

            if (transactionId) {
                updateObject["$set"]["txid"] = transactionId;
            }

            const result = await collection.findOneAndUpdate({ id: paymentId }, updateObject, {
                returnOriginal: false,
                upsert: true,
            });

            if (!isFindAndUpdateOneResultValid(result, false)) {
                throw new Error(
                    `Failed to save/update transaction to payment mapping item. Payment id: ${paymentId}, txid: ${transactionId}.`
                );
            }
            log.debug(`The transaction to payment mapping was saved/updated ${paymentId}`);
        } catch (e) {
            improveAndRethrow(e, "saveTransactionToPaymentMapping");
        }
    }

    /**
     * Gets a list of transaction id to payment id mappings
     *
     * @param {Array<string>} paymentIds - ids of payments to find mapping for
     * @return {Promise<Array<Object>>} - resolves to Array of objects { txid: string, pid: string, fiatAmount: number, fiatCurrencyCode: string }
     */
    static async getTransactionsToPaymentsMapping(paymentIds) {
        try {
            log.debug(`Start getting payments to transactions mapping. Payments count: ${paymentIds.length}`);

            if (!Array.isArray(paymentIds)) {
                throw new Error("An array of payment ids should be passed.");
            }

            if (paymentIds.length === 0) {
                log.debug("Given array of payment ids is empty. Returning empty array");
                return [];
            }

            const collection = await dbConnectionHolder.getCollection(this.documentName);
            let data = await collection.find({ id: { $in: paymentIds } }).toArray();

            data = data.map(item => ({
                txid: item.txid,
                paymentId: item.id,
                fiatAmount: item.a,
                fiatCurrencyCode: item.c,
            }));

            log.debug(`Found ${data.length} mapping items. returning`);
            return data;
        } catch (e) {
            improveAndRethrow(e, "getTransactionsToPaymentsMapping");
        }
    }

    /**
     * Gets a list of notifications per given payment id ordered by notification date desc
     *
     * @param paymentIds {Array} - ids of payments to get notifications for
     * @return {Promise<Array<Object>>} an array of object { paymentId: sting, notifications: [{ type: <SUCCESS|ERROR>, timestamp: number}, ...]}
     */
    static async getPaymentsNotifications(paymentIds) {
        try {
            log.debug(`Start getting notifications for payments. Payment ids count: ${paymentIds.length}`);

            if (!Array.isArray(paymentIds)) {
                throw new Error("An array of payments ids should be passed.");
            }

            if (paymentIds.length === 0) {
                log.debug("Given array of payment ids is empty. Returning empty array");
                return [];
            }

            const collection = await dbConnectionHolder.getCollection(this.documentName);
            const data = await collection
                .find({ id: { $in: paymentIds }, s: { $exists: true, $ne: [] } }, { $order: 1 })
                .toArray();

            const notifications = data
                .map(item => ({
                    paymentId: item.id,
                    notifications: item.s
                        .map(notification => {
                            const statusKey = Object.keys(this.STATUSES).find(
                                key => this.STATUSES[key].number === notification[0]
                            );
                            return {
                                type: statusKey ? this.STATUSES[statusKey].id : null,
                                timestamp: notification[1],
                            };
                        })
                        .filter(item => item.type != null),
                }))
                .sort((n1, n2) => n2.timestamp > n1.timestamp);

            log.debug(`Found ${data.length} payments having notifications. Returning`);

            return notifications;
        } catch (e) {
            improveAndRethrow(e, "getTransactionsToPaymentsMapping");
        }
    }
}
