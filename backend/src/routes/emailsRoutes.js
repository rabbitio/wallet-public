import express from "express";

import { apiVersionPrefix } from "../controllers/controllerUtils.js";
import EmailsController from "../controllers/emails.js";

const router = express.Router({});

const basePrefix = `${apiVersionPrefix}/emails`;

router.post(basePrefix, EmailsController.sendEmail);

export default router;
