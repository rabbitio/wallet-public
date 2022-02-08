import express from "express";
import { apiVersionPrefix } from "../controllers/controllerUtils";
import TransactionsDataController from "../controllers/transactionsData";

const router = express.Router({});

const basePrefix = `${apiVersionPrefix}/transactionsData`;

// TODO: [refactoring, moderate] RESTify the API (put by id)
router.post(basePrefix, TransactionsDataController.saveTransactionData);
router.post(`${basePrefix}/get`, TransactionsDataController.getTransactionData);
router.put(basePrefix, TransactionsDataController.updateTransactionData);

export default router;
