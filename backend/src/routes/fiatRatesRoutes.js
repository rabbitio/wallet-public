import express from "express";

import { apiVersionPrefix } from "../controllers/controllerUtils.js";
import FiatRatesController from "../controllers/fiatRates.js";

const router = express.Router({});

const basePrefix = `${apiVersionPrefix}/fiatRates`;

router.get(basePrefix, FiatRatesController.getFiatRates);
router.get(`${basePrefix}/:timestamp`, FiatRatesController.getFiatRateForSpecificDate);

export default router;
