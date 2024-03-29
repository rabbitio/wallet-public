import { improveAndRethrow, Logger } from "@rabbitio/ui-kit";

import UtxosService from "./internal/utxosService.js";
import PaymentService from "./paymentService.js";
import { getCurrentSmallestFeeRate } from "./feeRatesService.js";
import { Storage } from "../../../common/services/internal/storage.js";
import CoinsToFiatRatesService from "../../common/services/coinsToFiatRatesService.js";
import { Coins } from "../../coins.js";

export default class BalanceService {
    /**
     * Calculates and returns spendable wallet balance and dust balance in terms of current fee rate for greatest
     * supported blocks count
     *
     * @param [forceCalculate=false] {boolean} whether to force calculate balance (to avoid using cached values)
     * @return {Promise<{
     *             btcAmount: number,
     *             fiatAmount: number,
     *             btcDustAmount: number,
     *             fiatDustAmount: number
     *         }>}
     */
    static async getSpendableWalletBalance(forceCalculate = false) {
        const loggerSource = "getSpendableWalletBalance";
        try {
            Logger.log("Start getting balance", loggerSource);

            const network = Storage.getCurrentNetwork();
            const currentSmallestFeeRate = await getCurrentSmallestFeeRate(
                network,
                PaymentService.BLOCKS_COUNTS_FOR_OPTIONS
            );

            Logger.log(
                `Getting balance, smallest rate is ${currentSmallestFeeRate.blocksCount}->${currentSmallestFeeRate.rate}`,
                loggerSource
            );

            const balanceData = await UtxosService.calculateBalance(currentSmallestFeeRate, forceCalculate);
            const spendableBtcAmount = Number(Coins.COINS.BTC.atomsToCoinAmount("" + balanceData.spendable));
            const btcDustAmount = Number(Coins.COINS.BTC.atomsToCoinAmount("" + balanceData.dust));
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

    /**
     * Calculates and returns unconfirmed wallet balance.
     *
     * @return {Promise<string>}
     */
    static async getUnconfirmedWalletBalance() {
        const loggerSource = "getUnconfirmedWalletBalance";
        try {
            Logger.log("Start getting balance", loggerSource);
            const balanceData = await UtxosService.calculateBalance();
            const unconfirmedBtcAmount = Coins.COINS.BTC.atomsToCoinAmount("" + balanceData.unconfirmed);
            Logger.log(`Returning: ${unconfirmedBtcAmount}`, loggerSource);
            return unconfirmedBtcAmount;
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    static markBtcBalanceCacheAsExpired() {
        UtxosService.markBtcBalanceCacheAsExpired();
    }

    static actualizeBalanceCacheWithAmountAtoms(amountAtoms, sign) {
        UtxosService.actualizeBalanceCacheWithAmountAtoms(amountAtoms, sign);
    }
}
