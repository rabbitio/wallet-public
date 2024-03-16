import { improveAndRethrow, Logger, EmailsApi } from "@rabbitio/ui-kit";

import { SUPPORT_EMAIL } from "../../../properties.js";

export default class SupportService {
    /**
     * Composes mailto URL
     *
     * @param messageBody - text of message
     * @param messageSubject - subject of message
     * @return {string} - mailto URL
     */
    static composeMailToLink(messageBody = "", messageSubject = "") {
        const body = `&body=${encodeURIComponent(messageBody)}`;
        return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(messageSubject)}${body}`;
    }

    /**
     * Sends message to support
     *
     * @param messageBody - body of email to be sent
     * @param messageSubject - email subject
     * @param senderEmail - email of sender
     * @return {Promise<void>}
     */
    static async sendMessageToSupport(messageBody = "", messageSubject = "", senderEmail = "") {
        const loggerSource = "sendMessageToSupport";
        try {
            Logger.log(
                `Start sending. Body: ${messageBody.length}, subject: ${messageSubject}, sender: ${senderEmail.length}`,
                loggerSource
            );

            if (!messageBody) {
                throw new Error("Message body cannot be empty.");
            }

            senderEmail?.length && (messageBody = `${messageBody}\n\nSender: ${senderEmail}`);

            await EmailsApi.sendEmail(messageSubject, messageBody);

            Logger.log("Message was sent", loggerSource);
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }
}
