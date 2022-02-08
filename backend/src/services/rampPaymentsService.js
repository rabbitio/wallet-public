import { getLogger } from "log4js";
import { improveAndRethrow } from "../utils/utils";
import TransactionsToPaymentsService from "./transactionsToPaymentsService";

const log = getLogger("rampPaymentsService");

export default class RampPaymentsService {
    static PROVIDER_ID = "ramp";

    /**
     * Processes webhook event from ramp.network. We expect at least RELEASED event.
     * The whole list of payment events: https://docs.ramp.network/sdk-reference/#purchase-status
     *
     * @param event {Object} (see PurchaseStatusWebhookEvent inside ramp.network's SDK)
     * @return {Promise<void>}
     */
    static async handleRampNetworkPaymentEvent(event) {
        try {
            log.debug(`"${event.type}" received from RAMP. Start processing`);

            const txid = event.purchase.finalTxHash;
            const paymentId = event.purchase.id;
            const status = event.purchase.status;
            const fiatAmount = event.purchase.fiatValue;
            const fiatCurrencyCode = event.purchase.fiatCurrency;
            if (status === "RELEASED") {
                if (txid == null) {
                    log.error(`RAMP sent RELEASED with empty tx ID. Payment id: ${event.purchase.id}, txid: ${txid}.`);
                } else {
                    await TransactionsToPaymentsService.saveTransactionToPaymentMapping(
                        paymentId,
                        this.PROVIDER_ID,
                        TransactionsToPaymentsService.STATUSES.SUCCESS,
                        txid,
                        fiatAmount,
                        fiatCurrencyCode
                    );
                }
            } else if (status === "PAYMENT_FAILED" || status === "EXPIRED" || status === "CANCELLED") {
                await TransactionsToPaymentsService.saveTransactionToPaymentMapping(
                    paymentId,
                    this.PROVIDER_ID,
                    TransactionsToPaymentsService.STATUSES.ERROR,
                    txid,
                    fiatAmount,
                    fiatCurrencyCode
                );
            } else if (
                status === "INITIALIZED" ||
                status === "PAYMENT_STARTED" ||
                status === "PAYMENT_IN_PROGRESS" ||
                status === "PAYMENT_EXECUTED" ||
                status === "FIAT_SENT" ||
                status === "FIAT_RECEIVED" ||
                status === "RELEASING"
            ) {
                log.debug(
                    `Intermediate status received from RAMP: "${status}". Doing nothing for it. Payment id: ${paymentId}`
                );
            } else {
                log.error(`Unexpected status received from ramp: ${status}. Payment id: ${paymentId}`);
            }
        } catch (e) {
            improveAndRethrow(e, "handleRampNetworkPaymentEvent");
        }
    }
}
