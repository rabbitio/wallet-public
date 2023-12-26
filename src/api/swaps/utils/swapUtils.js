import CoinsToFiatRatesService from "../../wallet/common/services/coinsToFiatRatesService";
import { AmountUtils } from "../../wallet/common/utils/amountUtils";
import { Logger } from "../../support/services/internal/logs/logger";
import { safeStringify } from "../../common/utils/browserUtils";
import { SwapProvider } from "../external-apis/swapProvider";
import { improveAndRethrow } from "../../common/utils/errorUtils";
import EmailsApi from "../../support/backend-api/emailAPI";
import { ExistingSwapWithFiatData } from "../models/existingSwapWithFiatData";

export class SwapUtils {
    /**
     * Retrieves min and max limits for swapping giving currencies.
     * Returns also conversion rate if possible with predefined amount logic.
     * Rate is how many "to" coins does 1 "from" coin contain.
     *
     * In case of errors returns one of reasons
     *   - SwapProvider.NO_SWAPS_REASONS.NOT_SUPPORTED
     *   - one of SwapProvider.COMMON_ERRORS.*
     *
     * @param swapProvider {SwapProvider}
     * @param fromCoin {Coin} enabled coin (to swap amount from)
     * @param toCoin {Coin}
     * @return {Promise<{
     *             result: true,
     *             min: number,
     *             fiatMin: (number|null),
     *             max: number,
     *             fiatMax: (number|null),
     *             rate: (number|null),
     *         }|{
     *             result: false,
     *             reason: string
     *         }>}
     */
    static async getInitialSwapData(swapProvider, fromCoin, toCoin) {
        const loggerSource = "getInitialSwapData";
        try {
            /* We use some amount here that should fit at least some of the limits of the swap providers.
             * So we are going to get some rate to be used as the default for the on-flight calculations before we get
             * the exact rate (that should be retrieved by getSwapDetails method) for a specific amount.
             */
            const defaultAmountUsd = 300;
            const coinUsdRate = await CoinsToFiatRatesService.getCoinToUSDRate(fromCoin);
            const coinAmountForDefaultUsdAmount = AmountUtils.trimCryptoAmountByCoin(
                defaultAmountUsd / +coinUsdRate?.rate,
                fromCoin
            );
            Logger.log(`Init: ${coinAmountForDefaultUsdAmount} ${fromCoin.ticker}->${toCoin.ticker}`, loggerSource);
            const details = await swapProvider.getSwapInfo(fromCoin, toCoin, +coinAmountForDefaultUsdAmount);
            if (!details) {
                throw new Error("The details are empty: " + safeStringify(details));
            }
            if (!details.result) {
                Logger.log(`Failed with reason: ${details.reason}. ${fromCoin.ticker}->${toCoin.ticker}`, loggerSource);
                if (
                    details?.reason === SwapProvider.NO_SWAPS_REASONS.NOT_SUPPORTED ||
                    details?.reason === SwapProvider.COMMON_ERRORS.REQUESTS_LIMIT_EXCEEDED
                ) {
                    return { result: false, reason: details.reason };
                } else {
                    throw new Error("Unhandled error case: " + details?.reason);
                }
            }
            const fiatData = await CoinsToFiatRatesService.convertCoinsAmountsToCurrentlySelectedFiat([
                { coin: fromCoin, amounts: [details?.smallestMin, details?.greatestMax] },
            ]);
            const [fiatMin, fiatMax] = fiatData[0].amountsFiat;
            const result = {
                result: true,
                min: details?.smallestMin,
                fiatMin: fiatMin,
                max: details?.greatestMax,
                fiatMax: fiatMax,
                rate: details?.rate ?? null,
            };
            Logger.log(`Returning: ${safeStringify(result)}`, loggerSource);
            return result;
        } catch (e) {
            Logger.log(`Failed to init swap: ${safeStringify(e)}`, loggerSource);
            improveAndRethrow(e, loggerSource);
        }
    }

    static safeHandleRequestsLimitExceeding() {
        (async () => {
            try {
                await EmailsApi.sendEmail(
                    "AUTOMATIC EMAIL - SWAPSPACE REQUESTS LIMIT EXCEEDED",
                    "Requests limit exceeded. Urgently ask swaps provider support for limit increasing"
                );
            } catch (e) {
                Logger.log(`Failed to handle limit exceeding ${safeStringify(e)}`, "_safeHandleRequestsLimitExceeding");
            }
        })();
    }

    /**
     *
     * @param swapProvider {SwapProvider}
     * @param swapIds {string[]}
     * @return {Promise<{result: true, swaps: ExistingSwapWithFiatData[]}|{result: false, reason: string}>}
     */
    static async getExistingSwapsDetailsWithFiatAmounts(swapProvider, swapIds) {
        try {
            const result = await swapProvider.getExistingSwapsDetailsAndStatus(swapIds);
            if (result.result) {
                const fiatData = await CoinsToFiatRatesService.convertCoinsAmountsToCurrentlySelectedFiat(
                    result.swaps
                        .map(swap => {
                            const data = [
                                { coin: swap.fromCoin, amounts: [swap.fromAmount] },
                                { coin: swap.toCoin, amounts: [swap.toAmount] },
                            ];
                            if (swap.status === SwapProvider.SWAP_STATUSES.REFUNDED) {
                                data[1].coin = swap.fromCoin;
                            }
                            return data;
                        })
                        .flat()
                );
                result.swaps = result.swaps.map((swap, index) =>
                    ExistingSwapWithFiatData.fromExistingSwap(
                        swap,
                        fiatData[index * 2].amountsFiat[0],
                        fiatData[index * 2 + 1].amountsFiat[0],
                        fiatData[index * 2].fiatCurrencyCode,
                        fiatData[index * 2].fiatCurrencyDecimals
                    )
                );
            }

            return result;
        } catch (e) {
            improveAndRethrow(e, "getExistingSwapsDetailsWithFiatAmounts");
        }
    }
}