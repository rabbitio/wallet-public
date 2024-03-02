import express from "express";

import { apiVersionPrefix } from "../controllers/controllerUtils.js";
import NotificationsController from "../controllers/notifications.js";

const router = express.Router({});

const basePrefix = `${apiVersionPrefix}/notifications`;

router.get(basePrefix, NotificationsController.getNotifications);
// We use GET + such path here to be able to save notifications by clicking link in browser/messenger by Admin
router.get(basePrefix + "/save", NotificationsController.saveNotification);

export default router;
