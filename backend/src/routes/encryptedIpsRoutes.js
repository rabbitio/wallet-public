import express from "express";
import { apiVersionPrefix } from "../controllers/controllerUtils";
import { EncryptedIpsController } from "../controllers/encryptedIps";

const router = express.Router({});

const basePrefix = `${apiVersionPrefix}/encryptedIps`;

// TODO: [refactoring, moderate] RESTify the API (delete by /id)
router.post(basePrefix, EncryptedIpsController.saveEncryptedIp);
router.get(basePrefix, EncryptedIpsController.getEncryptedIps);
router.delete(basePrefix, EncryptedIpsController.deleteEncryptedIps);
// TODO: [bug, blocker] The same path for GET call, fix it
router.get(basePrefix, EncryptedIpsController.isIpHashPresent);

export default router;
