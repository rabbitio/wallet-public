import express from "express";
import { apiVersionPrefix } from "../controllers/controllerUtils";
import { EncryptedWalletPaymentIdsController } from "../controllers/encryptedWalletPaymentIds";

const router = express.Router({});

const basePrefix = `${apiVersionPrefix}/encryptedWalletPaymentIds`;

router.post(basePrefix, EncryptedWalletPaymentIdsController.saveEncryptedWalletPaymentId);
router.get(basePrefix + "/:walletId", EncryptedWalletPaymentIdsController.getEncryptedWalletPaymentIds);

export default router;
