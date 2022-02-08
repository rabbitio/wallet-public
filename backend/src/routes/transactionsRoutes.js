import express from "express";
import { apiVersionPrefix } from "../controllers/controllerUtils";
import TransactionsController from "../controllers/transactions";
import { FiatPaymentsController } from "../controllers/fiatPayments";

const router = express.Router({});

const basePrefix = `${apiVersionPrefix}/transactions`;

router.post(basePrefix, TransactionsController.saveTransactions);
router.post(`${basePrefix}/get`, TransactionsController.getTransactions); // POST is to use body for transaction ids

export default router;
