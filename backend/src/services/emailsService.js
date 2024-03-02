import log4js from "log4js";
import nodemailer from "nodemailer";

import { improveAndRethrow } from "@rabbitio/ui-kit";

import { SUPPORT_EMAIL, SUPPORT_EMAIL_PASSWORD, EMAIL_BRIDGE_HOST, EMAIL_BRIDGE_PORT } from "../properties.js";

const log = log4js.getLogger("emailsService");

export default class EmailsService {
    static _transporter = nodemailer.createTransport({
        host: EMAIL_BRIDGE_HOST,
        port: EMAIL_BRIDGE_PORT,
        secure: false, // true for 465, false for other ports
        auth: {
            user: SUPPORT_EMAIL,
            pass: SUPPORT_EMAIL_PASSWORD,
        },
        tls: {
            rejectUnauthorized: false, // TODO: [bug, critical] Is it ok to ignore certificates errors here?
        },
    });

    /**
     * Sends email to support email address
     *
     * @param subject - subject of email
     * @param body - text of email body
     * @return {Promise<void>}
     */
    static async sendEmail(subject, body) {
        try {
            log.debug("Start sending email.");
            await this._transporter.sendMail({
                from: `"Rabbit Server" ${SUPPORT_EMAIL}`,
                to: SUPPORT_EMAIL,
                subject: subject,
                text: body,
            });
            log.debug("Email is sent.");
        } catch (e) {
            improveAndRethrow(e, "sendEmail");
        }
    }
}
