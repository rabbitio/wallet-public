import express from "express";

import AddressesDataController from "../controllers/addressesData.js";
import { apiVersionPrefix } from "../controllers/controllerUtils.js";
import { addressesDataDbCollectionName } from "../services/addressesDataService.js";

const basePrefix = `${apiVersionPrefix}/${addressesDataDbCollectionName}`;

const router = express.Router({});

router.get(`${basePrefix}/:walletId/addresses`, AddressesDataController.getAddressesData);
router.get(`${basePrefix}/:walletId/indexes`, AddressesDataController.getAddressesIndexes);
router.patch(`${basePrefix}/:walletId/addresses/:uuid`, AddressesDataController.updateAddressData);
router.delete(`${basePrefix}/:walletId/addresses/:uuid`, AddressesDataController.removeAddressData);
router.patch(`${basePrefix}/:walletId/indexes*`, AddressesDataController.updateAddressIndex);
router.patch(`${basePrefix}/:walletId`, AddressesDataController.updateAddressIndexAndSaveAddressesData);

export default router;
