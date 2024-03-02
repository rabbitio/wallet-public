import express from "express";

import { apiVersionPrefix } from "../controllers/controllerUtils.js";
import ClientLogs from "../controllers/clientLogs.js";

const router = express.Router({});

const basePrefix = `${apiVersionPrefix}/logs`;

router.post(`${basePrefix}/:logsId`, ClientLogs.saveClientLogsToFile);
router.get(`${basePrefix}/:logsId`, ClientLogs.downloadLogsFileById);

export default router;
