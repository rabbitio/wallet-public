import { BigNumber } from "bignumber.js";

import {
    AmountUtils,
    improveAndRethrow,
    safeStringify,
    SwapProvider,
    Logger,
    Coin,
    SwapspaceSwapProvider,
    SwapUtils,
    IpAddressProvider,
} from "@rabbitio/ui-kit";

import { Wallets } from "../wallets.js";
import { Coins } from "../../coins.js";
import { cache } from "../../../common/utils/cache.js";
import { Storage } from "../../../common/services/internal/storage.js";
import { TxData } from "../models/tx-data.js";
import CoinsToFiatRatesService from "./coinsToFiatRatesService.js";
import { SendCoinsService } from "./sendCoinsService.js";
import { BalancesService } from "./balancesService.js";
import { EventBus, SWAP_CREATED_EVENT, SWAP_TX_PUSHED_EVENT } from "../../../common/adapters/eventbus.js";
import { ETHEREUM_BLOCKCHAIN } from "../../eth/ethereumBlockchain.js";
import { TRON_BLOCKCHAIN } from "../../trx/tronBlockchain.js";
import { BITCOIN_BLOCKCHAIN } from "../../btc/bitcoinBlockchain.js";
import { SwapCreationInfo } from "../models/swapCreationInfo.js";
import { API_KEYS_PROXY_URL } from "../../../common/backend-api/utils.js";
import { ERC20 } from "../../erc20token/erc20Protocol.js";
import { TRC20 } from "../../trc20token/trc20Protocol.js";
import { TickersAdapter } from "../external-apis/utils/tickersAdapter.js";

export class SwapService {
    static SWAPS_COMMON_ERRORS = {
        REQUESTS_LIMIT_EXCEEDED: "requestsLimitExceeded",
    };

    static SWAP_DETAILS_FAIL_REASONS = {
        NETWORK_FEE_PLUS_FROM_AMOUNT_EXCEED_BALANCE: "networkFeePlusFromAmountExceedBalance",
        DIFFERENT_FEE_COIN_NETWORK_FEE_EXCEEDS_BALANCE: "differentFeeCoinNetworkFeeExceedsBalance",
        FROM_AMOUNT_EXCEEDS_BALANCE: "fromAmountExceedsBalance",
        AMOUNT_LESS_THAN_MIN_SWAPPABLE: "amountLessThanMinSwappable",
        AMOUNT_HIGHER_THAN_MAX_SWAPPABLE: "amountHigherThanMaxSwappable",
        PAIR_NOT_SUPPORTED: "pairNotSupported",
        FAILED_TO_CALCULATE_TX_FEE: "failedToCalculateTxFee",
        SAME_COINS: "sameCoins",
    };

    static SWAP_CREATION_FAIL_REASONS = {
        // RETRIABLE_FAIL: "retriableFail", // TODO: [feature, high] use this code for retriable errors task_id=a07e367e488f4a4899613ac9056fa359
        TX_CREATION_ERROR: "txCreationError",
    };

    /**
     * @param swapProvider {SwapProvider}
     */
    constructor(swapProvider) {
        this._swapProvider = swapProvider;
    }

    getSwapCreationInfoTtlMs() {
        return this._swapProvider.getSwapCreationInfoTtlMs();
    }

    /**
     * Returns all enabled coins supported by provider.
     * Empty array means there are no enabled coins supported by swap provider.
     * First coin in the list should be used as default selected one.
     * Coins data list is sorted desc by balance.
     *
     * Returns one of SwapService.SWAPS_COMMON_ERRORS in case of processable fail.
     *
     * @return {Promise<({
     *             result: true,
     *             coinsData: {
     *                 coin: Coin,
     *                 balance: string,
     *                 balanceFiat: string,
     *                 fiatCurrencyCode: string,
     *                 fiatCurrencyDecimals: number,
     *                 fiatCurrencySymbol: string,
     *             }[]}|{
     *                 result: false,
     *                 reason: string
     *             })>}
     *
     */
    async getSwappableCurrencies() {
        const loggerSource = "getSwappableCurrencies";
        try {
            const result = await this._swapProvider.getDepositCurrencies();
            if (result.reason === SwapProvider.COMMON_ERRORS.REQUESTS_LIMIT_EXCEEDED) {
                SwapUtils.safeHandleRequestsLimitExceeding();
                return { result: false, reason: SwapService.SWAPS_COMMON_ERRORS.REQUESTS_LIMIT_EXCEEDED };
            }
            Logger.log(`Retrieved ${result?.coins?.length} supported currencies for exchange`, loggerSource);
            const enabled = Coins.getEnabledCoinsList();
            const enabledSupportedByProvider = enabled.filter(enabledCoin =>
                result.coins.find(supportedCoin => supportedCoin.ticker === enabledCoin.ticker)
            );
            const wallets = Wallets.getWalletsByCoins(enabledSupportedByProvider);
            let balances = await BalancesService.getBalancesWithFiat(wallets);
            balances.sort((i1, i2) => {
                const diff = BigNumber(i2.balanceFiat).minus(i1.balanceFiat);
                return diff.isNegative() ? -1 : diff.isZero() ? 0 : 1;
            });
            Logger.log(
                `Balances for enabled coins supported by swap provider ${safeStringify(
                    balances.map(b => ({ c: b?.coin?.ticker, b: b?.balanceFiat }))
                )}`,
                loggerSource
            );

            return {
                result: true,
                coinsData: balances.map(item => ({
                    coin: item.coin,
                    balance: item.balanceCoins,
                    balanceFiat: item.balanceFiat,
                    fiatCurrencyCode: item.fiatCurrencyCode,
                    fiatCurrencyDecimals: item.fiatCurrencyDecimals,
                    fiatCurrencySymbol: item.fiatCurrencySymbol,
                })),
            };
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Returns all coins that user can get if swapping 'fromCoin'.
     * First coin in the list should be used as default selected one.
     * Returns one of SwapService.SWAPS_COMMON_ERRORS in case of processable fail.
     *
     * @param fromCoin {Coin}
     * @return {Promise<({ result: true, coins: Coin[] }|{ result: false, reason: string })>}
     */
    async getReceivableCurrencies(fromCoin) {
        const loggerSource = "getReceivableCurrencies";
        try {
            if (!(fromCoin instanceof Coin)) {
                throw new Error("Invalid coin provided: " + fromCoin);
            }
            const providerResult = await this._swapProvider.getWithdrawalCurrencies(fromCoin);
            if (!providerResult.result) {
                if (providerResult.reason === SwapProvider.COMMON_ERRORS.REQUESTS_LIMIT_EXCEEDED) {
                    SwapUtils.safeHandleRequestsLimitExceeding();
                    return { result: false, reason: SwapService.SWAPS_COMMON_ERRORS.REQUESTS_LIMIT_EXCEEDED };
                }
                throw new Error("Unsupported error code: " + providerResult.reason);
            }
            const enabledCoins = Coins.getEnabledCoinsList().filter(enabledCoin =>
                providerResult.coins.find(supportedCoin => supportedCoin.ticker === enabledCoin.ticker)
            );
            const notEnabledSupportedCoins = providerResult.coins.filter(
                supportedCoin => enabledCoins.find(enabledCoin => enabledCoin.ticker === supportedCoin.ticker) == null
            );
            notEnabledSupportedCoins.sort((c1, c2) =>
                c1.latinName.toLowerCase().localeCompare(c2.latinName.toLowerCase())
            );
            const finalCoinsList = [...enabledCoins, ...notEnabledSupportedCoins];
            if (finalCoinsList[0] === fromCoin && finalCoinsList.length > 1) {
                let temp = finalCoinsList[0];
                finalCoinsList[0] = finalCoinsList[1];
                finalCoinsList[1] = temp;
            }
            return {
                result: true,
                coins: finalCoinsList,
            };
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Retrieved swappable currencies list and balances, receivable currencies list,
     * default 'from' and 'to' coins for a swap.
     *
     * @param fromCoin
     * @return {Promise<{
     *             result: true,
     *             swappableData: {
     *                 coin: Coin,
     *                 balance: string,
     *                 balanceTrimmed: string,
     *                 balanceFiat: string,
     *                 fiatCurrencyCode: string,
     *                 fiatCurrencyDecimals: number,
     *                 fiatCurrencySymbol: string
     *             }[],
     *             receivableCoins: Coin[],
     *             defaultFromCoin: Coin,
     *             defaultToCoin: Coin
     *         }|{
     *             result: false,
     *             reason: string
     *         }>}
     */
    async getCurrencyListsAndDefaultSelectedForSwap(fromCoin = null) {
        try {
            const composeSuccessResult = (swappableData, receivableCoins, defaultFromCoin, defaultToCoin) => ({
                result: true,
                swappableData: swappableData,
                receivableCoins: receivableCoins,
                defaultFromCoin: defaultFromCoin,
                defaultToCoin: defaultToCoin,
            });
            const swappable = await this.getSwappableCurrencies();
            if (!swappable.result) {
                return { result: false, reason: swappable.reason };
            } else if (swappable.coinsData.length === 0) {
                return composeSuccessResult([], [], null, null);
            } else {
                const isPassedCoinEnabled = swappable?.coinsData?.find(d => d?.coin?.ticker === fromCoin?.ticker);
                if (fromCoin && !isPassedCoinEnabled) {
                    // We throw error here as by design user cannot swap disabled coins
                    throw new Error(`'fromCoin' is not enabled or incorrect: ${fromCoin?.ticker}`);
                }
                let toCoin;
                let sendingCoin;
                if (fromCoin) {
                    sendingCoin = fromCoin;
                    toCoin = swappable.coinsData.find(item => item.coin.ticker !== fromCoin.ticker)?.coin;
                } else {
                    sendingCoin = swappable.coinsData[0]?.coin;
                    toCoin = swappable.coinsData[1]?.coin;
                }
                const receivable = await this.getReceivableCurrencies(sendingCoin);
                if (!receivable.result) {
                    return { result: false, reason: receivable.reason };
                } else {
                    if (toCoin == null) {
                        toCoin =
                            sendingCoin.ticker === Coins.COINS.BTC.ticker ? Coins.COINS.USDTTRC20 : Coins.COINS.BTC;
                        if (receivable.coins.find(coin => coin.ticker === toCoin?.ticker) == null) {
                            // If the selected default coin is not supported we use just the first supported
                            toCoin = receivable.coins[0];
                        }
                    }
                }
                return composeSuccessResult(swappable.coinsData, receivable.coins, sendingCoin, toCoin);
            }
        } catch (e) {
            improveAndRethrow(e, "getCurrencyListsAndDefaultSelectedForSwap");
        }
    }

    /**
     * Retrieves swap creation info for giving parameters that can be used to create swap.
     *
     * Note: it caches swap creation info from swap provider under the hood so this method can be used for
     * frequent recalculations.
     * But there are few reasons except cache expiration that trigger the recalculation like:
     * 1. when sending BTC we should recalculate network fee each time because of outputs;
     * 2. we cannot use swap creation info from provider if giving fromAmount is not in [min, max];
     * 3. etc.
     * Despite on some possible slow recalculations this method is still sane because it aggregates the plenty of cases
     * that we should handle during the swap details calculation.
     *
     * @param fromCoin {Coin}
     * @param toCoin {Coin}
     * @param fromAmountCoins {string}
     * @param [swapAll=false] {boolean}
     * @return {Promise<{
     *             result: true,
     *             swapCreationInfo: SwapCreationInfo,
     *         }|{
     *             result: false,
     *             reason: (SwapService.SWAP_DETAILS_FAIL_REASONS|SwapService.SWAPS_COMMON_ERRORS),
     *             min: (string|null|undefined),
     *             fiatMin: (number|null|undefined),
     *             max: (string|null|undefined),
     *             fiatMax: (number|null|undefined),
     *             fromBalanceCoins: (string|null),
     *             feeCoins: (string|null|undefined),
     *             feeFiat: (number|null|undefined),
     *             rate: (string|null|undefined),
     *         }>}
     *
     * TODO: [tests, critical] unit tests are required
     */
    async getSwapCreationInfo(fromCoin, toCoin, fromAmountCoins, swapAll = false) {
        const loggerSource = "getSwapCreationInfo";
        try {
            let fromBalanceCoins = (await BalancesService.getBalances([Wallets.getWalletByCoin(fromCoin)]))[0];
            this._throwErrorIfParamsNotValid(fromAmountCoins, fromBalanceCoins, swapAll);
            const feeResult = await this._calculateNetworkFee(fromCoin, fromAmountCoins, swapAll, fromBalanceCoins);
            const feeCoins = feeResult?.feeCoins ?? undefined;
            const isFeePayable = typeof feeCoins === "string" && !feeResult?.isFeeCoinBalanceNotEnoughForAllOptions;
            if (swapAll) {
                if (isFeePayable) {
                    if (fromCoin.doesUseDifferentCoinFee()) {
                        fromAmountCoins = AmountUtils.trim(fromBalanceCoins, fromCoin.digits);
                    } else {
                        fromAmountCoins = fromCoin.atomsToCoinAmount(feeResult.fastestOptionTxData.amount);
                    }
                } else {
                    /* We use just some default value to make sure we get min/max limits for swap all case when the fee
                     * is not payable by balance, and we are just preparing to return a fail so getting more details for
                     * its construction. We will return fail result at the validation stage.
                     */
                    fromAmountCoins = "1";
                }
            }
            const cacheKey = `swap_details_${fromCoin.ticker}-${toCoin.ticker}-${fromAmountCoins}`;
            let details = cache.get(cacheKey);
            if (
                details == null ||
                swapAll ||
                !details.result ||
                (details.min != null && BigNumber(fromAmountCoins).lt(details.min)) ||
                (details.max != null && BigNumber(fromAmountCoins).gt(details.max))
            ) {
                /* Requesting the data if no item found in the cache/expired or the data contains the fail result or if
                 * the fromAmount doesn't fit min or max limits for the cached data (as we need to select another rate
                 * internally for the amount to fit another min/max as the cached rate is just for coins pair and doesn't
                 * depend on min/max).
                 * Also we recalculate despite on the present data when swap all is requested.
                 */
                const usdRate = (await CoinsToFiatRatesService.getCoinToUSDRate(fromCoin))?.rate ?? null;
                details = await this._swapProvider.getSwapInfo(fromCoin, toCoin, fromAmountCoins, false, usdRate);
                cache.putSessionDependentData(cacheKey, details, this.getSwapCreationInfoTtlMs());
                Logger.log(`Fetched the swap details: ${safeStringify(details)}`, loggerSource);
            }

            if (!details) {
                throw new Error("The details are empty: " + safeStringify(details));
            }
            const min = details.result ? details.min : details.smallestMin;
            const max = details.result ? details.max : details.greatestMax;
            const fiatData = await CoinsToFiatRatesService.convertCoinsAmountsToCurrentlySelectedFiat([
                { coin: fromCoin, amounts: [min, max] },
                { coin: fromCoin.feeCoin, amounts: [feeCoins] },
            ]);
            const [fiatMin, fiatMax] = fiatData[0].amountsFiat;
            const feeFiat = fiatData[1].amountsFiat[0];
            const composeFailResult = reason => ({
                result: false,
                reason: reason,
                min: min ?? null,
                fiatMin: fiatMin,
                max: max ?? null,
                fiatMax: fiatMax,
                fromBalanceCoins: fromBalanceCoins,
                feeCoins: feeCoins,
                feeFiat: feeFiat ?? undefined,
                rate: details.rate ?? undefined, // Suitable for validation errors like exceeding balance
                fixed: details.fixed ?? false,
            });

            if (!details.result) {
                if (details?.reason === SwapProvider.NO_SWAPS_REASONS.NOT_SUPPORTED)
                    return composeFailResult(SwapService.SWAP_DETAILS_FAIL_REASONS.PAIR_NOT_SUPPORTED);
                else if (details?.reason === SwapProvider.COMMON_ERRORS.REQUESTS_LIMIT_EXCEEDED) {
                    SwapUtils.safeHandleRequestsLimitExceeding();
                    return composeFailResult(SwapService.SWAPS_COMMON_ERRORS.REQUESTS_LIMIT_EXCEEDED);
                }
            }

            if (feeResult?.result === false) {
                return composeFailResult(feeResult.reason);
            }

            const validation = await this._validateSwap(
                fromCoin,
                toCoin,
                fromAmountCoins,
                isFeePayable,
                swapAll,
                feeCoins,
                min,
                max,
                fromBalanceCoins
            );
            if (!validation.result) {
                return composeFailResult(validation.reason);
            }
            const toAmountCoins = AmountUtils.trim(BigNumber(fromAmountCoins).times(details.rate), toCoin.digits);
            const result = {
                result: true,
                swapCreationInfo: new SwapCreationInfo(
                    fromCoin,
                    toCoin,
                    fromAmountCoins,
                    toAmountCoins,
                    fromCoin.feeCoin,
                    feeResult.feeCoins,
                    feeFiat,
                    details.rate,
                    details.rawSwapData,
                    min,
                    fiatMin,
                    max,
                    fiatMax,
                    feeResult.fastestOptionTxData,
                    details.durationMinutesRange,
                    details.fixed ?? false
                ),
            };
            Logger.log(
                `Result: ${safeStringify({
                    result: result.result,
                    swapCreationInfo: {
                        ...result.swapCreationInfo,
                        fromCoin: result?.swapCreationInfo?.fromCoin?.ticker,
                        toCoin: result?.swapCreationInfo?.toCoin?.ticker,
                        feeCoin: result?.swapCreationInfo?.feeCoin?.ticker,
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
     * @param coin {Coin}
     * @return {string} address
     * @private
     */
    _getFakeAddressForTransactionFeeEstimation(coin) {
        try {
            /* TODO: [feature, moderate] We use these addresses as we don't know the actual target address when estimating
             *       swap network fee.
             *       For some blockchains address can affect the fee and the confirmation speed. Currently we just use the
             *       most standard addresses per blockchain but there is a task to improve this task_id=5a5b1229661f40b1b1839cd6dd3fa137
             *       For now we use addresses from one of our test wallet. (Test wallet #5)
             */
            let address;
            switch (coin.blockchain) {
                case BITCOIN_BLOCKCHAIN:
                    address = "bc1qn09cnuteke9nc74sdg627xx8a8cpettuh8sqzr";
                    break;
                case ETHEREUM_BLOCKCHAIN:
                    address = "0x5551bd33f5bbde0cbc59fb1078f65b7b3c52c77a";
                    break;
                case TRON_BLOCKCHAIN:
                    address = "TByaFxkXmYh16Nw1RUBpJaUkmiR7radQjW";
                    break;
                default:
                    throw new Error("Not supported blockchain in swap service: " + coin.blockchain);
            }
            return address;
        } catch (e) {
            improveAndRethrow(e, "_getFakeAddressForTransactionFeeEstimation");
        }
    }

    /**
     * @param fromCoin {Coin}
     * @param fromAmountCoins {string}
     * @param swapAll {boolean}
     * @param fromBalanceCoins {string}
     * @return {Promise<{
     *             result: boolean,
     *             fastestOptionTxData: TxData,
     *             feeCoins: string,
     *             isFeeCoinBalanceNotEnoughForAllOptions: boolean
     *         }|{
     *             result: false,
     *             reason: string
     *         }>}
     * @private
     */
    async _calculateNetworkFee(fromCoin, fromAmountCoins, swapAll, fromBalanceCoins) {
        const loggerSource = "_calculateNetworkFee";
        try {
            const fromWallet = Wallets.getWalletByCoin(fromCoin);
            const feeOptionsResult = await fromWallet.createTransactionsWithFakeSignatures(
                this._getFakeAddressForTransactionFeeEstimation(fromCoin),
                fromAmountCoins,
                swapAll,
                Storage.getCurrentNetwork(fromCoin),
                fromBalanceCoins,
                true
            );
            Logger.log(`Retrieved fee options for swap: ${safeStringify(feeOptionsResult)}`, loggerSource);

            if (!feeOptionsResult.result) {
                return { result: false, reason: SwapService.SWAP_DETAILS_FAIL_REASONS.FAILED_TO_CALCULATE_TX_FEE };
            }

            const fastestOption = feeOptionsResult.txsDataArray[0];
            if (fastestOption) {
                /* We deliberately set null address to avoid having any target address at this step (concerning possible
                 * bugs, for safety).
                 */
                fastestOption.address = null;
            }
            const currentChangeAddress = await fromWallet.getCurrentChangeAddressIfSupported();
            if (fastestOption.changeAddress != null && fastestOption.changeAddress !== currentChangeAddress) {
                /* Just ensuring the change address is correct as for corresponding coins it is critical
                 * to have it correct to send the change.
                 */
                throw new Error("Wrong change address inside swap details creation.");
            }
            const feeCoins =
                fastestOption instanceof TxData ? fromCoin.feeCoin.atomsToCoinAmount(fastestOption.fee) : null;
            Logger.log(`Returning fee: ${feeCoins}, txData: ${safeStringify(fastestOption)}`, loggerSource);
            return {
                result: true,
                feeCoins: feeCoins,
                fastestOptionTxData: fastestOption,
                isFeeCoinBalanceNotEnoughForAllOptions: feeOptionsResult.isFeeCoinBalanceNotEnoughForAllOptions,
            };
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Retrieves min and max limits for swapping giving currencies.
     * Returns also conversion rate if possible with predefined amount logic.
     * Rate is how many "to" coins does 1 "from" coin contain.
     *
     * In case of errors returns one of reasons
     *   - SwapService.SWAP_DETAILS_FAIL_REASONS.PAIR_NOT_SUPPORTED
     *   - one of SwapService.SWAPS_COMMON_ERRORS.*
     *
     * @param fromCoin {Coin} enabled coin (to swap amount from)
     * @param toCoin {Coin}
     * @return {Promise<{
     *             result: true,
     *             min: string,
     *             fiatMin: (number|null),
     *             max: string,
     *             fiatMax: (number|null),
     *             rate: (string|null),
     *         }|{
     *             result: false,
     *             reason: string
     *         }>}
     */
    async getInitialSwapData(fromCoin, toCoin) {
        const loggerSource = "getInitialSwapData";
        try {
            const coinFiatRate =
                await CoinsToFiatRatesService.getCoinToCurrentFiatCurrencyRateForSpecificDate(fromCoin);
            const result = await SwapUtils.getInitialSwapData(
                this._swapProvider,
                fromCoin,
                toCoin,
                coinFiatRate?.rate ? String(coinFiatRate?.rate) : null,
                coinFiatRate?.decimalCount != null ? coinFiatRate.decimalCount : null
            );
            if (!result.result) {
                if (result?.reason === SwapProvider.NO_SWAPS_REASONS.NOT_SUPPORTED)
                    return { result: false, reason: SwapService.SWAP_DETAILS_FAIL_REASONS.PAIR_NOT_SUPPORTED };
                else if (result?.reason === SwapProvider.COMMON_ERRORS.REQUESTS_LIMIT_EXCEEDED) {
                    SwapUtils.safeHandleRequestsLimitExceeding();
                    return { result: false, reason: SwapService.SWAPS_COMMON_ERRORS.REQUESTS_LIMIT_EXCEEDED };
                }
            }
            return result;
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * @param fromAmount {string}
     * @param fromBalanceCoins {string}
     * @param swapAll {boolean}
     * @private
     */
    _throwErrorIfParamsNotValid(fromAmount, fromBalanceCoins, swapAll) {
        if (
            (!swapAll && (typeof fromAmount !== "string" || !fromAmount.match(/\d+\.?\d*/))) ||
            typeof fromBalanceCoins !== "string" ||
            !fromBalanceCoins.match(/\d+\.?\d*/)
        ) {
            throw new Error(`Wrong from amount or balance: ${fromAmount}, ${fromBalanceCoins}`);
        }
    }

    /**
     * @param fromCoin {Coin}
     * @param toCoin {Coin}
     * @param fromAmount {string}
     * @param isFeePayable {boolean}
     * @param swapAll {boolean}
     * @param feeCoins {string|null}
     * @param min {string|null}
     * @param max {string|null}
     * @param fromBalanceCoins {string}
     * @return {Promise<{
     *             result: true
     *         }|{
     *             result: false,
     *             reason: string
     *          }>} reason is one of SwapService.SWAP_DETAILS_FAIL_REASONS
     * @throws {Error} if fee is not null but not positive number
     *
     * TODO: [tests, high] unit tests are required
     */
    async _validateSwap(fromCoin, toCoin, fromAmount, isFeePayable, swapAll, feeCoins, min, max, fromBalanceCoins) {
        const loggerSource = "_validateSwap";
        try {
            Logger.log(
                `Validating ${fromCoin.ticker} ${fromAmount}, ${fromBalanceCoins} ${feeCoins} ${min} ${max}`,
                loggerSource
            );
            if (feeCoins != null && !feeCoins.match(/\d+\.?\d*/)) {
                throw new Error(`Wrong fee: ${feeCoins}, ${typeof feeCoins}`);
            }
            const fromAmountBigNumber = BigNumber(fromAmount);
            let failReason = null;
            if (fromCoin === toCoin) {
                failReason = SwapService.SWAP_DETAILS_FAIL_REASONS.SAME_COINS;
            } else if (!isFeePayable && swapAll) {
                /* When estimating swapAll=true we don't check actual balances and amount to decide whether amount+fee
                 * exceed balance. We just use pre-calculated flag isFeePayable.
                 */
                if (fromCoin.doesUseDifferentCoinFee()) {
                    failReason = SwapService.SWAP_DETAILS_FAIL_REASONS.DIFFERENT_FEE_COIN_NETWORK_FEE_EXCEEDS_BALANCE;
                } else {
                    failReason = SwapService.SWAP_DETAILS_FAIL_REASONS.NETWORK_FEE_PLUS_FROM_AMOUNT_EXCEED_BALANCE;
                }
            } else if (fromAmountBigNumber.gt(fromBalanceCoins)) {
                failReason = SwapService.SWAP_DETAILS_FAIL_REASONS.FROM_AMOUNT_EXCEEDS_BALANCE;
            } else if (typeof min === "string" && fromAmountBigNumber.lt(min)) {
                failReason = SwapService.SWAP_DETAILS_FAIL_REASONS.AMOUNT_LESS_THAN_MIN_SWAPPABLE;
            } else if (typeof max === "string" && fromAmountBigNumber.gt(max)) {
                failReason = SwapService.SWAP_DETAILS_FAIL_REASONS.AMOUNT_HIGHER_THAN_MAX_SWAPPABLE;
            } else if (feeCoins == null || !isFeePayable) {
                if (fromCoin.doesUseDifferentCoinFee()) {
                    failReason = SwapService.SWAP_DETAILS_FAIL_REASONS.DIFFERENT_FEE_COIN_NETWORK_FEE_EXCEEDS_BALANCE;
                } else {
                    failReason = SwapService.SWAP_DETAILS_FAIL_REASONS.NETWORK_FEE_PLUS_FROM_AMOUNT_EXCEED_BALANCE;
                }
            }

            if (failReason) {
                let result = { result: false, reason: failReason };
                Logger.log(`Returning fail result ${safeStringify(result)}`, loggerSource);
                return result;
            }
            return { result: true };
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * @param fromCoin {Coin}
     * @param toCoin {Coin}
     * @param fromAmount {string}
     * @param swapCreationInfo {SwapCreationInfo}
     * @return {Promise<{
     *              result: true,
     *              swapId: string,
     *              fromCoin: Coin,
     *              toCoin: Coin,
     *              fromAmount: string,
     *              toAmount: string,
     *              fromAmountFiat: (number|null),
     *              toAmountFiat: (number|null),
     *              fiatCurrencyCode: string,
     *              fiatCurrencyDecimals: number,
     *              rate: string,
     *              transactionNote: string,
     *              txData: TxData,
     *              feeCoins: string,
     *              feeFiat: number,
     *              durationMinutesRange: string,
     *              fixed: boolean
     *
     *          }|{
     *              result: false,
     *              reason: (SwapService.SWAP_CREATION_FAIL_REASONS|SwapService.COMMON_ERRORS)
     *          }>}
     */
    async createSwap(fromCoin, toCoin, fromAmount, swapCreationInfo) {
        const loggerSource = "createSwap";
        try {
            if (
                !(fromCoin instanceof Coin) ||
                !(toCoin instanceof Coin) ||
                typeof fromAmount !== "string" ||
                !(swapCreationInfo instanceof SwapCreationInfo)
            ) {
                throw new Error(`Wrong input: ${fromCoin} ${toCoin} ${fromAmount} ${swapCreationInfo}`);
            }
            Logger.log(
                `Start: ${fromAmount} ${fromCoin.ticker} -> ${toCoin.ticker}. Details: ${safeStringify({
                    ...swapCreationInfo,
                    fromCoin: swapCreationInfo?.fromCoin?.ticker,
                    toCoin: swapCreationInfo?.toCoin?.ticker,
                    feeCoin: swapCreationInfo?.feeCoin?.ticker,
                })}`,
                loggerSource
            );
            const fromWallet = Wallets.getWalletByCoin(fromCoin);
            const toWallet = Wallets.getWalletByCoin(toCoin);
            const toAddress = await toWallet.getCurrentAddress();
            const refundAddress = await fromWallet.getCurrentAddress();

            Logger.log(`To address: ${toAddress}, refund address: ${refundAddress}`, loggerSource);

            const clientIp = await IpAddressProvider.getClientIpAddress();

            const result = await this._swapProvider.createSwap(
                fromCoin,
                toCoin,
                fromAmount,
                toAddress,
                refundAddress,
                swapCreationInfo.rawSwapData,
                clientIp,
                false
            );
            Logger.log(
                `Created:${safeStringify({
                    ...result,
                    fromCoin: result?.fromCoin?.ticker,
                    toCoin: result?.toCoin?.ticker,
                })}`,
                loggerSource
            );
            if (!result?.result) {
                if (result?.reason === SwapProvider.COMMON_ERRORS.REQUESTS_LIMIT_EXCEEDED) {
                    SwapUtils.safeHandleRequestsLimitExceeding();
                    return { result: false, reason: SwapService.SWAPS_COMMON_ERRORS.REQUESTS_LIMIT_EXCEEDED };
                }
                if (result?.reason === SwapProvider.CREATION_FAIL_REASONS.RETRIABLE_FAIL) {
                    // TODO: [feature, high] implement retrying if one partner fail and we have another partners task_id=a07e367e488f4a4899613ac9056fa359
                    // return {
                    //     result: false,
                    //     reason: SwapService.SWAP_CREATION_FAIL_REASONS.RETRIABLE_FAIL,
                    // };
                }
            }
            if (result.result && result?.swapId) {
                const feeCoins = fromCoin.feeCoin.atomsToCoinAmount(swapCreationInfo.txData.fee);
                const fiatRequest = [
                    { coin: fromCoin, amounts: [result.fromAmount] },
                    { coin: toCoin, amounts: [result.toAmount] },
                ];
                if (fromCoin.doesUseDifferentCoinFee()) {
                    fiatRequest.push({ coin: fromCoin.feeCoin, amounts: [feeCoins] });
                } else {
                    fiatRequest[0].amounts.push(feeCoins);
                }
                const fiatData = await CoinsToFiatRatesService.convertCoinsAmountsToCurrentlySelectedFiat(fiatRequest);
                const fromAmountFiat = fiatData[0].amountsFiat[0];
                const toAmountFiat = fiatData[1].amountsFiat[0];
                const feeFiat = fromCoin.doesUseDifferentCoinFee()
                    ? fiatData[2].amountsFiat[0]
                    : fiatData[0].amountsFiat[1];
                const currentFiatCurrencyData = CoinsToFiatRatesService.getCurrentFiatCurrencyData();
                const fromCurrencyString =
                    fromCoin.tickerPrintable + (fromCoin.protocol ? ` ${fromCoin.protocol.protocol}` : "");
                const toCurrencyString =
                    toCoin.tickerPrintable + (toCoin.protocol ? ` ${toCoin.protocol.protocol}` : "");
                // TODO: [feature, moderate] add text to translations task_id=c744fff79f8f4904b803730bf24548e8
                const note = `Swap ${fromCurrencyString} to ${toCurrencyString}. Expect to receive the ${toCurrencyString} transaction shortly after the ${fromCurrencyString} transaction is confirmed. If the swap fails for any reason, you will receive a refund. Swap ID: ${result.swapId}`;
                /*
                 * WARNING: critical point - setting target address to send coins to swaps provider.
                 * We fail if address is not valid for safety.
                 */
                if (typeof result.fromAddress !== "string" || result.fromAddress.length === 0) {
                    throw new Error("Wrong address returned during swap creation");
                }
                swapCreationInfo.txData.address = result.fromAddress;

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
                    transactionNote: note,
                    txData: swapCreationInfo.txData,
                    feeCoins: feeCoins,
                    feeFiat: feeFiat,
                    durationMinutesRange: swapCreationInfo.durationMinutesRange,
                    fixed: false,
                };
                Logger.log(
                    `Returning: ${safeStringify({
                        ...toReturn,
                        fromCoin: toReturn?.fromCoin?.ticker,
                        toCoin: toReturn?.toCoin?.ticker,
                    })}`,
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
     * Sends transaction for already created swap. Should be called after createSwap.
     * When returning fail result the reason is SwapService.SWAP_CREATION_FAIL_REASONS.TX_CREATION_ERROR.
     *
     * @param fromCoin {Coin}
     * @param txData {TxData}
     * @param note {string} note is prepared by createSwap and should be passed here so user can recognize this
     *                      transaction as sending for swapping
     * @param password {string}
     * @return {Promise<{ result: true, transactionId: string }|{ result: false, reason: string, message: string}>}
     */
    async sendSwapTransaction(fromCoin, txData, note, password) {
        const loggerSource = "sendSwapTransaction";
        try {
            Logger.log(`Start. Note: ${note}, details: ${safeStringify(txData)}`, loggerSource);
            if (
                !(fromCoin instanceof Coin) ||
                !(txData instanceof TxData) ||
                typeof note !== "string" ||
                typeof password !== "string"
            ) {
                throw new Error(
                    `Wrong input when creating send transaction for swap: ${fromCoin} ${txData} ${note} ${typeof password}`
                );
            }
            const transactionResult = await SendCoinsService.createTransactionByValidTxDataAndBroadcast(
                txData,
                fromCoin,
                password,
                note
            );
            if (typeof transactionResult.errorDescription === "string") {
                Logger.log(`Failed to create transaction: ${safeStringify(transactionResult)}`, loggerSource);
                return {
                    result: false,
                    reason: SwapService.SWAP_CREATION_FAIL_REASONS.TX_CREATION_ERROR,
                    message: `${transactionResult.errorDescription} ${transactionResult.howToFix}`,
                };
            }
            Logger.log(`Transaction created ${transactionResult}`, loggerSource);
            if (typeof transactionResult !== "string") {
                throw new Error("Unexpected transaction result: " + safeStringify(transactionResult));
            }

            EventBus.dispatch(
                SWAP_TX_PUSHED_EVENT,
                null,
                fromCoin.ticker,
                fromCoin.atomsToCoinAmount("" + txData.amount)
            );

            return { result: true, transactionId: transactionResult };
        } catch (e) {
            improveAndRethrow(e, "sendSwapTransaction");
        }
    }
}

function fromSwapspaceCodeAndNetworkToRabbitOOBSupportedCoin(code, network) {
    if (code === "btc" && network === "btc") return Coins.COINS.BTC;
    if (code === "eth" && network === "eth") return Coins.COINS.ETH;
    if (code === "trx" && network === "trx") return Coins.COINS.TRX;
    const protocol = network === "erc20" ? ERC20 : network === "trc20" ? TRC20 : null;
    if (!protocol) return null;
    const rabbitTicker = TickersAdapter.standardTickerToRabbitTicker(code, protocol.protocol);
    return Coins.getCoinByTickerIfPresent(rabbitTicker);
}

/**
 * Currently we have the only swapping provider so using the below SwapService instance.
 * @type {SwapService}
 */
export const swapService = new SwapService(
    new SwapspaceSwapProvider(
        API_KEYS_PROXY_URL + "/swapspace",
        cache,
        fromSwapspaceCodeAndNetworkToRabbitOOBSupportedCoin
    )
);
