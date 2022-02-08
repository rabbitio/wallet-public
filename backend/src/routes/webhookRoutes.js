import express from "express";

import { apiVersionPrefix } from "../controllers/controllerUtils";
import { WebhooksController } from "../controllers/webhooksController";

const router = express.Router({});

const basePrefix = `${apiVersionPrefix}/webhooks`;

router.post(`${basePrefix}/ramp`, WebhooksController.handleRampEvents);

export default router;
