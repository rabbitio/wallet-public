import UtxosService from "./internal/utxosService";
import PaymentService from "./paymentService";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { satoshiToBtc } from "../lib/btc-utils";
import { getCurrentSmallestFeeRate } from "./feeRatesService";
import { getCurrentNetwork } from "../../../common/services/internal/storage";
import { Logger } from "../../../support/services/internal/logs/logger";
import CoinsToFiatRatesService from "../../common/services/coinsToFiatRatesService";
import { Coins } from "../../coins";

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
        const loggerSource = "getSpendableWalletBalance";
        try {
            Logger.log("Start getting balance", loggerSource);

            const network = getCurrentNetwork();
            const currentSmallestFeeRate = await getCurrentSmallestFeeRate(
                network,
                PaymentService.BLOCKS_COUNTS_FOR_OPTIONS
            );

            Logger.log(
                `Getting balance, smallest rate is ${currentSmallestFeeRate.blocksCount}->${currentSmallestFeeRate.rate}`,
                loggerSource
            );

            const balanceData = await UtxosService.calculateBalance(currentSmallestFeeRate, forceCalculate);
            const spendableBtcAmount = satoshiToBtc(balanceData.spendable);
            const btcDustAmount = satoshiToBtc(balanceData.dust);
            const [spendableFiatAmount, fiatDustAmount] = await CoinsToFiatRatesService.convertCoinAmountsToFiat(
                Coins.COINS.BTC,
                [spendableBtcAmount, btcDustAmount]
            );

            const result = {
                btcAmount: spendableBtcAmount,
                fiatAmount: spendableFiatAmount,
                btcDustAmount: btcDustAmount,
                fiatDustAmount: fiatDustAmount,
            };

            Logger.log(`Returning: ${JSON.stringify(result)}`, loggerSource);
            return result;
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }
}
