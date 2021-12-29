import express from "express";
import { apiVersionPrefix } from "../controllers/controllerUtils";
import FiatRatesController from "../controllers/fiatRates";

const router = express.Router({});

const basePrefix = `${apiVersionPrefix}/fiatRates`;

router.get(basePrefix, FiatRatesController.getFiatRates);
router.get(`${basePrefix}/:timestamp`, FiatRatesController.getFiatRateForSpecificDate);

export default router;
