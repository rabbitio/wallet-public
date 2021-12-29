import express from "express";

import { apiVersionPrefix } from "../controllers/controllerUtils";
import WalletsController from "../controllers/wallets";
import { walletsDbCollectionName } from "../services/walletsService";

const router = express.Router({});

const basePrefix = `${apiVersionPrefix}/${walletsDbCollectionName}`;

// TODO: [refactoring, low] Restify API - use better bodies, more relevant methods
router.post(`${basePrefix}`, WalletsController.createWalletAndSession);
router.get(`${basePrefix}/:walletId`, WalletsController.getWalletData);
router.get(`${basePrefix}/:walletId/password`, WalletsController.checkPassword);
router.get(`${basePrefix}/:walletId/passphrase`, WalletsController.checkPassphrase);
router.post(`${basePrefix}/:walletId`, WalletsController.authenticate);
router.put(`${basePrefix}/:walletId`, WalletsController.changePassword);
router.put(`${basePrefix}/:walletId/settings`, WalletsController.saveSettings);
router.patch(`${basePrefix}/:walletId`, WalletsController.logout);
router.delete(`${basePrefix}/:walletId`, WalletsController.deleteWallet);

export default router;
