import { improveAndRethrow } from "../../common/utils/errorUtils";
import { SwapspaceSwapProvider } from "../external-apis/swapspaceSwapProvider";
import { SwapProvider } from "../external-apis/swapProvider";
import { Logger } from "../../support/services/internal/logs/logger";
import CoinsToFiatRatesService from "../../wallet/common/services/coinsToFiatRatesService";
import { safeStringify } from "../../common/utils/browserUtils";
import { Coin } from "../../wallet/common/models/coin";
import { EventBus, SWAP_CREATED_EVENT } from "../../common/adapters/eventbus";
import { SwapUtils } from "../utils/swapUtils";
import { Wallets } from "../../wallet/common/wallets";
import { getSwapIds, setSwapIds } from "../../common/services/internal/storage";

export class PublicSwapDetails {
    /**
     * @param fromCoin {Coin}
     * @param toCoin {Coin}
     * @param fromAmountCoins {string}
     * @param toAmountCoins {string}
     * @param rate {number}
     * @param rawSwapData {Object}
     * @param min {number}
     * @param fiatMin {number}
     * @param max {number}
     * @param fiatMax {number}
     * @param durationMinutesRange {string}
     */
    constructor(
        fromCoin,
        toCoin,
        fromAmountCoins,
        toAmountCoins,
        rate,
        rawSwapData,
        min,
        fiatMin,
        max,
        fiatMax,
        durationMinutesRange
    ) {
        this.fromCoin = fromCoin;
        this.toCoin = toCoin;
        this.fromAmountCoins = fromAmountCoins;
        this.toAmountCoins = toAmountCoins;
        this.rate = rate;
        this.rawSwapData = rawSwapData;
        this.min = min;
        this.fiatMin = fiatMin;
        this.max = max;
        this.fiatMax = fiatMax;
        this.durationMinutesRange = durationMinutesRange;
    }
}

export class PublicSwapService {
    static _swapProvider = new SwapspaceSwapProvider();

    static PUBLIC_SWAPS_COMMON_ERRORS = {
        REQUESTS_LIMIT_EXCEEDED: "requestsLimitExceeded",
    };

    static PUBLIC_SWAP_DETAILS_FAIL_REASONS = {
        AMOUNT_LESS_THAN_MIN_SWAPPABLE: "amountLessThanMinSwappable",
        AMOUNT_HIGHER_THAN_MAX_SWAPPABLE: "amountHigherThanMaxSwappable",
        PAIR_NOT_SUPPORTED: "pairNotSupported",
    };

    static async getCurrenciesListForPublicSwap(currencyThatShouldNotBeFirst = null) {
        const loggerSource = "getCurrenciesListForPublicSwap";
        try {
            const result = await this._swapProvider.getSupportedCurrencies();
            if (result.reason === SwapProvider.COMMON_ERRORS.REQUESTS_LIMIT_EXCEEDED) {
                SwapUtils.safeHandleRequestsLimitExceeding();
                return { result: false, reason: this.PUBLIC_SWAPS_COMMON_ERRORS.REQUESTS_LIMIT_EXCEEDED };
            }
            Logger.log(`Retrieved ${result?.coins?.length} supported currencies for swap`, loggerSource);
            if (result.coins[0] === currencyThatShouldNotBeFirst && result.coins.length > 1) {
                let temp = result.coins[0];
                result.coins[0] = result.coins[1];
                result.coins[1] = temp;
            }
            return { result: true, coins: result.coins };
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    static async getInitialPublicSwapData(fromCoin, toCoin) {
        try {
            const result = await SwapUtils.getInitialSwapData(this._swapProvider, fromCoin, toCoin);
            if (!result.result) {
                if (result.reason === SwapProvider.COMMON_ERRORS.REQUESTS_LIMIT_EXCEEDED) {
                    SwapUtils.safeHandleRequestsLimitExceeding();
                    return { result: false, reason: this.PUBLIC_SWAPS_COMMON_ERRORS.REQUESTS_LIMIT_EXCEEDED };
                }
                if (result.reason === SwapProvider.NO_SWAPS_REASONS.NOT_SUPPORTED) {
                    return { result: false, reason: this.PUBLIC_SWAP_DETAILS_FAIL_REASONS.PAIR_NOT_SUPPORTED };
                }
            }
            return result;
        } catch (e) {
            improveAndRethrow(e, "getInitialPublicSwapData");
        }
    }

    static async getPublicSwapDetails(fromCoin, toCoin, fromAmountCoins) {
        const loggerSource = "getPublicSwapDetails";
        try {
            const details = await this._swapProvider.getSwapInfo(fromCoin, toCoin, +fromAmountCoins);
            const min = details.result ? details.min : details.smallestMin;
            const max = details.result ? details.max : details.greatestMax;
            const fiatData = await CoinsToFiatRatesService.convertCoinsAmountsToCurrentlySelectedFiat([
                { coin: fromCoin, amounts: [min, max] },
            ]);
            const [fiatMin, fiatMax] = fiatData[0].amountsFiat;

            const composeFailResult = (reason, feeBalanceCoins) => ({
                result: false,
                reason: reason,
                min: min ?? null,
                fiatMin: fiatMin,
                max: max ?? null,
                fiatMax: fiatMax,
                rate: details.rate ?? undefined, // Suitable for validation errors like exceeding balance
            });

            if (!details.result) {
                if (details?.reason === SwapProvider.NO_SWAPS_REASONS.NOT_SUPPORTED)
                    return composeFailResult(this.PUBLIC_SWAP_DETAILS_FAIL_REASONS.PAIR_NOT_SUPPORTED);
                else if (details?.reason === SwapProvider.COMMON_ERRORS.REQUESTS_LIMIT_EXCEEDED) {
                    SwapUtils.safeHandleRequestsLimitExceeding();
                    return composeFailResult(this.PUBLIC_SWAPS_COMMON_ERRORS.REQUESTS_LIMIT_EXCEEDED);
                }
            }

            if (typeof min === "number" && fromAmountCoins < min) {
                return composeFailResult(this.PUBLIC_SWAP_DETAILS_FAIL_REASONS.AMOUNT_LESS_THAN_MIN_SWAPPABLE);
            } else if (typeof max === "number" && fromAmountCoins > max) {
                return composeFailResult(this.PUBLIC_SWAP_DETAILS_FAIL_REASONS.AMOUNT_HIGHER_THAN_MAX_SWAPPABLE);
            }

            const toAmountCoins = String(+fromAmountCoins * details.rate);
            const result = {
                result: true,
                swapDetails: new PublicSwapDetails(
                    fromCoin,
                    toCoin,
                    fromAmountCoins,
                    toAmountCoins,
                    details.rate,
                    details.rawSwapData,
                    min,
                    fiatMin,
                    max,
                    fiatMax,
                    details.durationMinutesRange
                ),
            };
            Logger.log(
                `Result: ${safeStringify({
                    result: result.result,
                    swapDetails: {
                        ...result.swapDetails,
                        fromCoin: result?.swapDetails?.fromCoin?.ticker,
                        toCoin: result?.swapDetails?.toCoin?.ticker,
                    },
                })}`,
                loggerSource
            );

            return result;
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * @param fromCoin {Coin}
     * @param toCoin {Coin}
     * @param refundAddress {string}
     * @param toAddress {string}
     * @return {Promise<void>}
     */
    static validateAddressesForPublicSwap(fromCoin, toCoin, refundAddress, toAddress) {
        try {
            const toAddressValid = Wallets.getWalletByCoin(toCoin).isAddressValid(toAddress)?.result;
            const refundAddressValid = Wallets.getWalletByCoin(fromCoin).isAddressValid(refundAddress)?.result;
            return {
                result: toAddressValid && refundAddressValid,
                toAddressValid: toAddressValid,
                refundAddressValid: refundAddressValid,
            };
        } catch (e) {
            improveAndRethrow(e, "validateAddressesForPublicSwap");
        }
    }

    static async createPublicSwap(fromCoin, toCoin, fromAmount, swapDetails, toAddress, refundAddress) {
        const loggerSource = "createPublicSwap";
        try {
            if (typeof fromAmount === "string") {
                fromAmount = Number(fromAmount);
            }
            if (
                !(fromCoin instanceof Coin) ||
                !(toCoin instanceof Coin) ||
                typeof fromAmount !== "number" ||
                typeof toAddress !== "string" ||
                typeof refundAddress !== "string" ||
                !(swapDetails instanceof PublicSwapDetails)
            ) {
                throw new Error(`Wrong input: ${fromCoin.ticker} ${toCoin.ticker} ${fromAmount} ${swapDetails}`);
            }
            Logger.log(
                `Start: ${fromAmount} ${fromCoin.ticker} -> ${toCoin.ticker}. Details: ${safeStringify({
                    ...swapDetails,
                    fromCoin: swapDetails?.fromCoin?.ticker,
                    toCoin: swapDetails?.toCoin?.ticker,
                })}`,
                loggerSource
            );

            const result = await this._swapProvider.createSwap(
                fromCoin,
                toCoin,
                fromAmount,
                toAddress,
                refundAddress,
                swapDetails.rawSwapData
            );
            Logger.log(
                `Created:${safeStringify({ ...result, fromCoin: fromCoin?.ticker, toCoin: toCoin?.ticker })}`,
                loggerSource
            );
            if (!result?.result) {
                if (result?.reason === SwapProvider.COMMON_ERRORS.REQUESTS_LIMIT_EXCEEDED) {
                    SwapUtils.safeHandleRequestsLimitExceeding();
                    return { result: false, reason: this.PUBLIC_SWAPS_COMMON_ERRORS.REQUESTS_LIMIT_EXCEEDED };
                }
                if (result?.reason === SwapProvider.CREATION_FAIL_REASONS.RETRIABLE_FAIL) {
                    // TODO: [feature, high] implement retrying if one partner fail and we have another partners task_id=a07e367e488f4a4899613ac9056fa359
                    // return {
                    //     result: false,
                    //     reason: this.SWAP_CREATION_FAIL_REASONS.RETRIABLE_FAIL,
                    // };
                }
            }
            if (result.result && result?.swapId) {
                const fiatRequest = [
                    { coin: fromCoin, amounts: [result.fromAmount] },
                    { coin: toCoin, amounts: [result.toAmount] },
                ];
                const fiatData = await CoinsToFiatRatesService.convertCoinsAmountsToCurrentlySelectedFiat(fiatRequest);
                const fromAmountFiat = fiatData[0].amountsFiat[0];
                const toAmountFiat = fiatData[1].amountsFiat[0];
                const currentFiatCurrencyData = CoinsToFiatRatesService.getCurrentFiatCurrencyData();

                EventBus.dispatch(SWAP_CREATED_EVENT, null, fromCoin.ticker, toCoin.ticker, result.fromAmount);

                const toReturn = {
                    result: true,
                    swapId: result.swapId,
                    fromCoin: fromCoin,
                    toCoin: toCoin,
                    fromAmount: result.fromAmount,
                    toAmount: result.toAmount,
                    fromAmountFiat: fromAmountFiat,
                    toAmountFiat: toAmountFiat,
                    fiatCurrencyCode: currentFiatCurrencyData.currency,
                    fiatCurrencyDecimals: currentFiatCurrencyData.decimalCount,
                    rate: result.rate,
                    durationMinutesRange: swapDetails.durationMinutesRange,
                    address: result.fromAddress, // TODO: tenfold check
                };

                this._savePublicSwapIdLocally(result.swapId);

                Logger.log(
                    `Returning: ${safeStringify({ ...toReturn, fromCoin: fromCoin?.ticker, toCoin: toCoin?.ticker })}`,
                    loggerSource
                );
                return toReturn;
            }

            throw new Error(`Unexpected result from provider ${safeStringify(result)}`);
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Retrieves swap details and status for existing swaps by their ids.
     *
     * @param swapIds {string[]}
     * @return {Promise<{result: true, swaps: ExistingSwapWithFiatData[]}|{result: false, reason: string}>}
     *         error reason is one of PUBLIC_SWAPS_COMMON_ERRORS
     */
    static async getPublicExistingSwapDetailsAndStatus(swapIds) {
        const loggerSource = "getPublicExistingSwapDetailsAndStatus";
        try {
            const result = await SwapUtils.getExistingSwapsDetailsWithFiatAmounts(this._swapProvider, swapIds);
            if (!result?.result) {
                if (result.reason === SwapProvider.COMMON_ERRORS.REQUESTS_LIMIT_EXCEEDED) {
                    SwapUtils.safeHandleRequestsLimitExceeding();
                    return { result: false, reason: this.PUBLIC_SWAPS_COMMON_ERRORS.REQUESTS_LIMIT_EXCEEDED };
                }
                throw new Error("Unknown reason: " + result?.reason);
            }

            return result;
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Retrieves the whole available swaps history by ids saved locally.
     *
     * @return {Promise<{result: true, swaps: ExistingSwapWithFiatData[]}|{result: false, reason: string}>}
     */
    static async getPublicSwapsHistory() {
        try {
            const swapIds = this._getPublicSwapIdsSavedLocally();
            if (swapIds.length) {
                return await this.getPublicExistingSwapDetailsAndStatus(swapIds);
            }
            return { result: true, swaps: [] };
        } catch (e) {
            improveAndRethrow(e, "getPublicSwapsHistory");
        }
    }

    /**
     * @param swapId {string}
     * @private
     */
    static _savePublicSwapIdLocally(swapId) {
        try {
            const saved = getSwapIds();
            const ids = typeof saved === "string" && saved.length > 0 ? saved.split(",") : [];
            ids.push(swapId);
            setSwapIds(ids.join(","));
        } catch (e) {
            improveAndRethrow(e, "_savePublicSwapIdLocally");
        }
    }

    /**
     * @private
     * @return {string[]}
     */
    static _getPublicSwapIdsSavedLocally() {
        try {
            const saved = getSwapIds();
            return typeof saved === "string" && saved.length > 0 ? saved.split(",") : [];
        } catch (e) {
            improveAndRethrow(e, "_getPublicSwapIdsSavedLocally");
        }
    }
}
