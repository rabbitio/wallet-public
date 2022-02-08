import express from "express";
import { apiVersionPrefix } from "../controllers/controllerUtils";
import { FiatPaymentsController } from "../controllers/fiatPayments";

const router = express.Router({});

const basePrefix = `${apiVersionPrefix}/fiatPayments`;

router.post(`${basePrefix}/getNotifications`, FiatPaymentsController.getPaymentsNotifications); // POST is used to push payment ids to body
router.post(`${basePrefix}/getMapping`, FiatPaymentsController.getTransactionsToPaymentsMapping); // POST is used to push transaction ids to body

export default router;
