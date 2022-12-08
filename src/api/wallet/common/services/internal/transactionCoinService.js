import { improveAndRethrow } from "../../../../common/utils/errorUtils";
import { Wallets } from "../../wallets";

export class TransactionCoinService {
    /**
     * Calculates the coin by given transaction id
     *
     * @param txId {string} transaction id string
     * @return {Promise<Coin>|null} Resolves to recognized coin
     * @throws {Error} if all wallets checked by the coin is not found
     */
    // TODO: [tests, critical, ether] test it
    static async getCoinByTransaction(txId) {
        try {
            const wallets = Wallets.getWalletsForAllSupportedCoins();
            let wallet = null;
            for (let i = 0; i < wallets.length; ++i) {
                const isBelonging = await wallets[i].isTxBelongingToWalletsCoin(txId);
                if (isBelonging) {
                    wallet = wallets[i];
                    break;
                }
            }

            if (!wallet) {
                throw new Error("Failed to recognize the transaction's coin by id: " + txId);
            }

            return wallet.coin;
        } catch (e) {
            improveAndRethrow(e, "getCoinByTransaction");
        }
    }
}
