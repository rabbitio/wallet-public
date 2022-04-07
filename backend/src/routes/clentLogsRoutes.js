import express from "express";
import { apiVersionPrefix } from "../controllers/controllerUtils";
import ClientLogs from "../controllers/clientLogs";

const router = express.Router({});

const basePrefix = `${apiVersionPrefix}/logs`;

router.post(`${basePrefix}/:logsId`, ClientLogs.saveClientLogsToFile);
router.get(`${basePrefix}/:logsId`, ClientLogs.downloadLogsFileById);

export default router;
