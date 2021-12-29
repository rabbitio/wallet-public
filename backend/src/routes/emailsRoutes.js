import express from "express";

import { apiVersionPrefix } from "../controllers/controllerUtils";
import EmailsController from "../controllers/emails";

const router = express.Router({});

const basePrefix = `${apiVersionPrefix}/emails`;

router.post(basePrefix, EmailsController.sendEmail);

export default router;
