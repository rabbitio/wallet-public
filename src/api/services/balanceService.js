import UtxosService from "./internal/utxosService";
import PaymentService from "./paymentService";
import { improveAndRethrow } from "../utils/errorUtils";
import { satoshiToBtc } from "../lib/btc-utils";
import { getCurrentSmallestFeeRate } from "./feeRatesService";
import { getCurrentNetwork } from "./internal/storage";

export default class BalanceService {
    /**
     * Calculates and returns spendable wallet balance and dust balance in terms of current fee rate for greatest
     * supported blocks count
     *
     * @param forceCalculate - whether to force calculate balance (to avoid using cached values)
     * @return Promise resolving to Object of following format
     *     {
     *         btcAmount: number,
     *         fiatAmount: number,
     *         btcDustAmount: number,
     *         fiatDustAmount: number
     *     }
     */
    static async getSpendableWalletBalance(forceCalculate = false) {
        try {
            const network = getCurrentNetwork();
            const currentSmallestFeeRate = await getCurrentSmallestFeeRate(
                network,
                PaymentService.BLOCKS_COUNTS_FOR_OPTIONS
            );
            const balanceData = await UtxosService.calculateBalance(currentSmallestFeeRate, forceCalculate);
            const spendableBtcAmount = satoshiToBtc(balanceData.spendable);
            const btcDustAmount = satoshiToBtc(balanceData.dust);
            const [spendableFiatAmount, fiatDustAmount] = await PaymentService.convertBtcAmountsToFiat([
                spendableBtcAmount,
                btcDustAmount,
            ]);

            return {
                btcAmount: spendableBtcAmount,
                fiatAmount: spendableFiatAmount,
                btcDustAmount: btcDustAmount,
                fiatDustAmount: fiatDustAmount,
            };
        } catch (e) {
            improveAndRethrow(e, "getSpendableWalletBalance");
        }
    }
}
