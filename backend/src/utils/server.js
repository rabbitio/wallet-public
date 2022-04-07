import express from "express";
import { connectLogger, getLogger } from "log4js";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";

import WalletsRoutes from "../routes/walletsRoutes";
import TransactionsDataRoutes from "../routes/transactionsDataRoutes";
import EncryptedIpsRoutes from "../routes/encryptedIpsRoutes";
import EncryptedInvoicesRoutes from "../routes/encryptedInvoicesRoutes";
import AddressesDataRoutes from "../routes/addressesDataRoutes";
import FiatRatesRoutes from "../routes/fiatRatesRoutes";
import NotificationsRoutes from "../routes/notificationsRoutes";
import EmailsRoutes from "../routes/emailsRoutes";
import FiatPaymentsRoutes from "../routes/fiatPaymentsRoutes";
import TransactionsRoutes from "../routes/transactionsRoutes";
import EncryptedWalletPaymentIdsRoutes from "../routes/encryptedWalletPaymentIdsRoutes";
import WebhookRoutes from "../routes/webhookRoutes";
import ClientLogsRoutes from "../routes/clentLogsRoutes";
import { SERVER_PORT } from "../properties";

const log = getLogger("server");

export function configureAndStartServer() {
    const app = express();
    app.use(connectLogger(getLogger("http"), { level: "auto" }));
    app.use(cookieParser());
    app.use(bodyParser.text({ limit: "5mb" })); // for parsing text/plain
    app.use(bodyParser.json({ limit: "1mb" })); // for parsing application/json
    app.use(bodyParser.urlencoded({ extended: true, limit: "100kb" })); // for parsing application/x-www-Form-urlencoded
    app.use(WalletsRoutes);
    app.use(TransactionsDataRoutes);
    app.use(EncryptedIpsRoutes);
    app.use(EncryptedInvoicesRoutes);
    app.use(AddressesDataRoutes);
    app.use(FiatRatesRoutes);
    app.use(NotificationsRoutes);
    app.use(EmailsRoutes);
    app.use(FiatPaymentsRoutes);
    app.use(TransactionsRoutes);
    app.use(EncryptedWalletPaymentIdsRoutes);
    app.use(WebhookRoutes);
    app.use(ClientLogsRoutes);

    app.listen(SERVER_PORT, () => {
        log.info(`Listening on ${SERVER_PORT}..., Node PID=${process.pid}`);
    });
}
