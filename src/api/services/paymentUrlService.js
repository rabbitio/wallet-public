import bip21 from "bip21";

import { getNetworkByAddress, isAddressValid } from "../lib/addresses";
import PaymentService from "./paymentService";
import { logError } from "../utils/errorUtils";
import { Logger } from "./internal/logs/logger";

export default class PaymentUrlService {
    static URL_PARAMETER_NAME = "paymentURL";
    static URL_PATH = "send";

    /**
     * Parses the given payment URL and returns result object or null if parsing failed.
     *
     * @param paymentUrl - payment URL string to be parsed
     * @return {Object|null} of following format (or null if parsing fails)
     *     {
     *         address: String  (not empty),
     *         amountBTC: number,
     *         fiatAmount: number,
     *         label: String (can be empty),
     *         message: String (can be empty)
     *     }
     */
    static async parsePaymentUrl(paymentUrl) {
        const loggerSource = "parsePaymentUrl";
        try {
            Logger.log(`Start parsing payment URL: ${paymentUrl}`, loggerSource);

            paymentUrl = decodeURIComponent(paymentUrl);
            let paymentDetails;
            try {
                paymentDetails = bip21.decode(paymentUrl);
            } catch (e) {
                paymentUrl = decodeURIComponent(paymentUrl); // try to decode second time for twice encoded URL
                paymentDetails = bip21.decode(paymentUrl);
            }

            Logger.log(`Payment URl parsed: ${JSON.stringify(paymentDetails)}`, loggerSource);

            const network = getNetworkByAddress(paymentDetails?.address);
            if (isAddressValid(paymentDetails?.address, network)) {
                const options = paymentDetails?.options;

                Logger.log("Address is valid. Getting fiat amount.", loggerSource);

                const fiatAmount = (await PaymentService.convertBtcAmountsToFiat([options?.amount]))[0];
                const data = {
                    address: paymentDetails.address,
                    amountBTC: options?.amount,
                    fiatAmount: fiatAmount,
                    label: options?.label,
                    message: options?.message,
                };

                Logger.log(`Returning data ${JSON.stringify(data)}`, loggerSource);
                return data;
            }

            Logger.log("Address isn't valid. Returning null", loggerSource);
            return null;
        } catch (e) {
            logError(e, loggerSource);
        }

        return null;
    }

    static generatePaymentUrl(address, amount, label, message) {
        if (!address) {
            throw new Error(`Cannot generate URL for empty address: ${address}.`);
        }

        try {
            const options = {};
            amount && (options.amount = amount);
            label && label !== "" && (options.label = label);
            message && message !== "" && (options.message = message);
            return bip21.encode(address, options);
        } catch (e) {
            logError(e, "generatePaymentUrl");
            return null;
        }
    }
}
