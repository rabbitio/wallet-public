import { BigNumber } from "bignumber.js";

import { AmountUtils, improveAndRethrow } from "@rabbitio/ui-kit";

import { SwapspaceSwapProvider } from "../external-apis/swapspaceSwapProvider.js";
import { SwapProvider } from "../external-apis/swapProvider.js";
import { Logger } from "../../support/services/internal/logs/logger.js";
import CoinsToFiatRatesService from "../../wallet/common/services/coinsToFiatRatesService.js";
import { safeStringify } from "../../common/utils/browserUtils.js";
import { Coin } from "../../wallet/common/models/coin.js";
import { EventBus, SWAP_CREATED_EVENT } from "../../common/adapters/eventbus.js";
import { SwapUtils } from "../utils/swapUtils.js";
import { Wallets } from "../../wallet/common/wallets.js";
import { Storage } from "../../common/services/internal/storage.js";
import { PublicSwapCreationInfo } from "../models/publicSwapCreationInfo.js";

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

    /**
     * Retrieves initial data for swapping two coins.
     *
     * @param fromCoin {Coin}
     * @param toCoin {Coin}
     * @return {Promise<{
     *             result: true,
     *             min: string,
     *             fiatMin: (number|null),
     *             max: string,
     *             fiatMax: (number|null),
     *             rate: (string|null)
     *         }|{
     *             result: false,
     *             reason: string
     *         }>}
     */
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

    /**
     * Retrieves swap details that can be used to create swap.
     *
     * @param fromCoin {Coin}
     * @param toCoin {Coin}
     * @param fromAmountCoins {string}
     * @return {Promise<{
     *             result: false,
     *             reason: string,
     *             min: (string|null),
     *             max: (string|null),
     *             rate: (string|undefined),
     *             fiatMin: (number|null),
     *             fiatMax: (number|null)
     *         }|{
     *             result: true,
     *             swapCreationInfo: PublicSwapCreationInfo
     *         }>}
     */
    static async getPublicSwapDetails(fromCoin, toCoin, fromAmountCoins) {
        const loggerSource = "getPublicSwapDetails";
        try {
            const details = await this._swapProvider.getSwapInfo(fromCoin, toCoin, fromAmountCoins);
            const min = details.result ? details.min : details.smallestMin;
            const max = details.result ? details.max : details.greatestMax;
            const fiatData = await CoinsToFiatRatesService.convertCoinsAmountsToCurrentlySelectedFiat([
                { coin: fromCoin, amounts: [min, max] },
            ]);
            const [fiatMin, fiatMax] = fiatData[0].amountsFiat;

            const composeFailResult = reason => ({
                result: false,
                reason: reason,
                min: min ?? null,
                fiatMin: fiatMin,
                max: max ?? null,
                fiatMax: fiatMax,
                rate: details.rate ?? null,
            });

            if (!details.result) {
                if (details?.reason === SwapProvider.NO_SWAPS_REASONS.NOT_SUPPORTED)
                    return composeFailResult(this.PUBLIC_SWAP_DETAILS_FAIL_REASONS.PAIR_NOT_SUPPORTED);
                else if (details?.reason === SwapProvider.COMMON_ERRORS.REQUESTS_LIMIT_EXCEEDED) {
                    SwapUtils.safeHandleRequestsLimitExceeding();
                    return composeFailResult(this.PUBLIC_SWAPS_COMMON_ERRORS.REQUESTS_LIMIT_EXCEEDED);
                }
            }

            const fromAmountBigNumber = BigNumber(fromAmountCoins);
            if (typeof min === "string" && fromAmountBigNumber.lt(min)) {
                return composeFailResult(this.PUBLIC_SWAP_DETAILS_FAIL_REASONS.AMOUNT_LESS_THAN_MIN_SWAPPABLE);
            } else if (typeof max === "string" && fromAmountBigNumber.gt(max)) {
                return composeFailResult(this.PUBLIC_SWAP_DETAILS_FAIL_REASONS.AMOUNT_HIGHER_THAN_MAX_SWAPPABLE);
            }

            const toAmountCoins = AmountUtils.trim(fromAmountBigNumber.times(details.rate), fromCoin.digits);
            const result = {
                result: true,
                swapCreationInfo: new PublicSwapCreationInfo(
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
                    swapCreationInfo: {
                        ...result.swapCreationInfo,
                        fromCoin: result?.swapCreationInfo?.fromCoin?.ticker,
                        toCoin: result?.swapCreationInfo?.toCoin?.ticker,
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

    /**
     * Creates swap by given params.
     *
     * @param fromCoin {Coin}
     * @param toCoin {Coin}
     * @param fromAmount {string}
     * @param swapCreationInfo {PublicSwapCreationInfo}
     * @param toAddress {string}
     * @param refundAddress {string}
     * @return {Promise<{
     *             result: true,
     *             fiatCurrencyCode: string,
     *             toCoin: Coin,
     *             fromAmountFiat: (number|null),
     *             address: string,
     *             durationMinutesRange: string,
     *             fromAmount: string,
     *             toAmount: string,
     *             toAmountFiat: (number|null),
     *             fiatCurrencyDecimals: number,
     *             fromCoin: Coin,
     *             rate: string,
     *             swapId: string
     *         }|{
     *             result: false,
     *             reason: string
     *         }>}
     */
    static async createPublicSwap(fromCoin, toCoin, fromAmount, swapCreationInfo, toAddress, refundAddress) {
        const loggerSource = "createPublicSwap";
        try {
            if (
                !(fromCoin instanceof Coin) ||
                !(toCoin instanceof Coin) ||
                typeof fromAmount !== "string" ||
                typeof toAddress !== "string" ||
                typeof refundAddress !== "string" ||
                !(swapCreationInfo instanceof PublicSwapCreationInfo)
            ) {
                throw new Error(`Wrong input: ${fromCoin.ticker} ${toCoin.ticker} ${fromAmount} ${swapCreationInfo}`);
            }
            Logger.log(
                `Start: ${fromAmount} ${fromCoin.ticker} -> ${toCoin.ticker}. Details: ${safeStringify({
                    ...swapCreationInfo,
                    fromCoin: swapCreationInfo?.fromCoin?.ticker,
                    toCoin: swapCreationInfo?.toCoin?.ticker,
                })}`,
                loggerSource
            );

            const result = await this._swapProvider.createSwap(
                fromCoin,
                toCoin,
                fromAmount,
                toAddress,
                refundAddress,
                swapCreationInfo.rawSwapData
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
                    durationMinutesRange: swapCreationInfo.durationMinutesRange,
                    address: result.fromAddress, // CRITICAL: this is the address to send coins to swaps provider
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
     * @return {Promise<{
     *              result: true,
     *              swaps: ExistingSwapWithFiatData[]
     *         }|{
     *              result: false,
     *              reason: string
     *         }>}
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
     * @return {Promise<{
     *             result: true,
     *             swaps: ExistingSwapWithFiatData[]
     *         }|{
     *             result: false,
     *             reason: string
     *         }>}
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
            const saved = Storage.getSwapIds();
            const ids = typeof saved === "string" && saved.length > 0 ? saved.split(",") : [];
            ids.push(swapId);
            Storage.setSwapIds(ids.join(","));
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
            const saved = Storage.getSwapIds();
            return typeof saved === "string" && saved.length > 0 ? saved.split(",") : [];
        } catch (e) {
            improveAndRethrow(e, "_getPublicSwapIdsSavedLocally");
        }
    }
}
