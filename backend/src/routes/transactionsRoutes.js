import express from "express";
import { apiVersionPrefix } from "../controllers/controllerUtils";
import TransactionsController from "../controllers/transactions";

const router = express.Router({});

const basePrefix = `${apiVersionPrefix}/transactions`;

router.post(basePrefix, TransactionsController.saveTransactions);
router.post(`${basePrefix}/get`, TransactionsController.getTransactions);

export default router;
