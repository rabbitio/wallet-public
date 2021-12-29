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
import TransactionsRoutes from "../routes/transactionsRoutes";
import { SERVER_PORT } from "../properties";

const log = getLogger("server");

export function configureAndStartServer() {
    const app = express();
    app.use(connectLogger(getLogger("http"), { level: "auto" }));
    app.use(cookieParser());
    app.use(bodyParser.json()); // for parsing application/json
    app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-Form-urlencoded
    app.use(WalletsRoutes);
    app.use(TransactionsDataRoutes);
    app.use(EncryptedIpsRoutes);
    app.use(EncryptedInvoicesRoutes);
    app.use(AddressesDataRoutes);
    app.use(FiatRatesRoutes);
    app.use(NotificationsRoutes);
    app.use(EmailsRoutes);
    app.use(TransactionsRoutes);

    app.listen(SERVER_PORT, () => {
        log.info(`Listening on ${SERVER_PORT}..., Node PID=${process.pid}`);
    });
}
