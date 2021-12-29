import express from "express";

import {apiVersionPrefix} from "../controllers/controllerUtils";
import {EncryptedInvoicesController} from "../controllers/encryptedInvoices";


const router = express.Router({});

const basePrefix = `${apiVersionPrefix}/encryptedInvoices`;

// TODO: [refactoring, moderate] RESTify the API (delete by /id)
router.post(basePrefix, EncryptedInvoicesController.saveEncryptedInvoice);
router.get(basePrefix, EncryptedInvoicesController.getEncryptedInvoices);
router.delete(basePrefix, EncryptedInvoicesController.deleteEncryptedInvoices);

export default router;
