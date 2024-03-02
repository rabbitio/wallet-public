import { improveAndRethrow } from "@rabbitio/ui-kit";

import { Wallets } from "../../wallets.js";

export class TransactionCoinService {
    /**
     * Calculates the coin by given transaction id
     *
     * @param txId {string} transaction id string
     * @return {Promise<Coin|null>} Resolves to recognized coin or null if transaction is not related to any of our coins and current wallet
     */
    // TODO: [tests, critical] test it
    static async getCoinByTransaction(txId) {
        try {
            const wallets = Wallets.getWalletsForAllEnabledCoins();
            let wallet = null;
            for (let i = 0; i < wallets.length; ++i) {
                const isBelonging = await wallets[i].isTxBelongingToWalletsCoin(txId);
                if (isBelonging) {
                    wallet = wallets[i];
                    break;
                }
            }

            return wallet?.coin ?? null;
        } catch (e) {
            improveAndRethrow(e, "getCoinByTransaction");
        }
    }
}
