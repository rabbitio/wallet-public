import axios from "axios";
import { BigNumber } from "bignumber.js";

import { AmountUtils, improveAndRethrow } from "@rabbitio/ui-kit";

import { SwapProvider } from "./swapProvider.js";
import { TickersAdapter } from "../../wallet/common/external-apis/utils/tickersAdapter.js";
import { Coin } from "../../wallet/common/models/coin.js";
import { Coins } from "../../wallet/coins.js";
import IpAddressProvider from "../../auth/external-apis/ipAddressProviders.js";
import { Logger } from "../../support/services/internal/logs/logger.js";
import { safeStringify } from "../../common/utils/browserUtils.js";
import CoinsToFiatRatesService from "../../wallet/common/services/coinsToFiatRatesService.js";
import { API_KEYS_PROXY_URL } from "../../common/backend-api/utils.js";
import { TRC20 } from "../../wallet/trc20token/trc20Protocol.js";
import { ERC20 } from "../../wallet/erc20token/erc20Protocol.js";
import { ExistingSwap } from "../models/existingSwap.js";

export const BANNED_PARTNERS = ["stealthex", "changee", "coincraddle"];

export class SwapspaceSwapProvider extends SwapProvider {
    constructor() {
        super();
        this._supportedCoins = [];
        this._URL = `${API_KEYS_PROXY_URL}/swapspace`;
        this._maxRateDigits = 20;
    }

    getSwapCreationInfoTtlMs() {
        /* Actually 2 minutes and only relevant for some partners, but we use it
         * (and even a bit smaller value) for better consistency */
        return 110000;
    }

    async getSupportedCurrencies() {
        const loggerSource = "getSupportedCurrencies";
        try {
            await this._fetchSupportedCurrenciesIfNeeded();
            Logger.log(`Returned ${this._supportedCoins?.length} supported coins`, loggerSource);
            return { result: true, coins: this._supportedCoins.map(item => item.coin) };
        } catch (e) {
            if (e?.response?.status === 429) {
                return { result: false, reason: SwapProvider.COMMON_ERRORS.REQUESTS_LIMIT_EXCEEDED };
            }
            improveAndRethrow(e, loggerSource);
        }
    }

    async _fetchSupportedCurrenciesIfNeeded() {
        const loggerSource = "_fetchSupportedCurrenciesIfNeeded";
        try {
            if (!this._supportedCoins?.length) {
                const rawResponse = await axios.get(`${this._URL}/api/v2/currencies`);
                Logger.log(`Retrieved ${rawResponse?.data?.length} currencies`, loggerSource);
                this._supportedCoins = (rawResponse?.data ?? [])
                    .map(item => {
                        const coin = this._fromSwapspaceCodeAndNetwork(item.code, item.network);
                        if (coin) {
                            return {
                                coin: coin,
                                extraId: item.hasExtraId ? item.extraIdName : "",
                                isPopular: !!item?.popular,
                            };
                        }

                        return [];
                    })
                    .flat();
                this._putPopularCoinsFirst();
            }
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * This method sort internal list putting popular (as swapspace thinks) coins to the top.
     * This is just for users of this API if they don't care about the sorting - we just improve a list a bit this way.
     * @private
     */
    _putPopularCoinsFirst() {
        this._supportedCoins.sort((i1, i2) => {
            if (i1.isPopular && !i2.isPopular) return -1;
            if (i2.isPopular && !i1.isPopular) return 1;
            return i1.coin.ticker > i2.coin.ticker ? 1 : i1.coin.ticker < i2.coin.ticker ? -1 : 0;
        });
    }

    _toSwapspaceNetwork(coin) {
        return coin.ticker === Coins.COINS.BTC.ticker
            ? "btc"
            : coin.ticker === Coins.COINS.ETH.ticker
              ? "eth"
              : coin.ticker === Coins.COINS.TRX.ticker
                ? "trx"
                : coin.protocol === TRC20
                  ? "trc20"
                  : coin.protocol === ERC20
                    ? "erc20"
                    : null;
    }

    async getSwapInfo(fromCoin, toCoin, amountCoins) {
        const loggerSource = "getSwapInfo";
        try {
            if (
                !(fromCoin instanceof Coin) ||
                !(toCoin instanceof Coin) ||
                typeof amountCoins !== "string" ||
                BigNumber(amountCoins).lt("0")
            ) {
                throw new Error(`Wrong input params: ${amountCoins} ${fromCoin.ticker} -> ${toCoin.ticker}`);
            }
            const fromTicker = TickersAdapter.rabbitTickerToStandardTicker(
                fromCoin.ticker,
                fromCoin.protocol
            ).toLowerCase();
            const fromNetwork = this._toSwapspaceNetwork(fromCoin);
            const toTicker = TickersAdapter.rabbitTickerToStandardTicker(toCoin.ticker, toCoin.protocol).toLowerCase();
            const toNetwork = this._toSwapspaceNetwork(toCoin);
            /* Here we use not documented parameter 'estimated=false'. This parameter controls whether we want to use
             * cached rate values stored in swapspace cache. Their support says they store at most for 30 sec.
             * But we are better off using the most actual rates.
             */
            const response = await axios.get(
                `${this._URL}/api/v2/amounts?fromCurrency=${fromTicker}&fromNetwork=${fromNetwork}&toNetwork=${toNetwork}&toCurrency=${toTicker}&amount=${amountCoins}&float=true&estimated=false`
            );
            Logger.log(`Retrieved ${response?.data?.length} options`, loggerSource);
            const options = Array.isArray(response.data) ? response.data : [];
            const exchangesSupportingThePair = options.filter(
                exchange =>
                    exchange?.exists &&
                    !BANNED_PARTNERS.find(bannedPartner => bannedPartner === exchange?.partner) &&
                    exchange?.fixed === false &&
                    (exchange.min === 0 ||
                        exchange.max === 0 ||
                        exchange.max > exchange.min ||
                        ((typeof exchange.min !== "number" || typeof exchange.max !== "number") &&
                            exchange.toAmount > 0))
            );
            Logger.log(`${exchangesSupportingThePair?.length} of them have exist=true`, loggerSource);
            if (!exchangesSupportingThePair.length) {
                return {
                    result: false,
                    reason: SwapProvider.NO_SWAPS_REASONS.NOT_SUPPORTED,
                };
            }
            const availableExchanges = exchangesSupportingThePair.filter(
                exchange => typeof exchange?.toAmount === "number" && exchange.toAmount > 0
            );
            Logger.log(`Available (having amountTo): ${safeStringify(availableExchanges)}`, loggerSource);
            // min=0 or max=0 means there is no limit for the partner
            let smallestMin = null;
            if (exchangesSupportingThePair.find(ex => BigNumber(ex.min).isZero()) == null) {
                smallestMin = exchangesSupportingThePair.reduce((prev, cur) => {
                    if (typeof cur.min === "number" && (prev === null || BigNumber(cur.min).lt(prev)))
                        return BigNumber(cur.min);
                    return prev;
                }, null);
            }
            let greatestMax = null;
            if (exchangesSupportingThePair.find(ex => BigNumber(ex.max).isZero()) == null) {
                greatestMax = exchangesSupportingThePair.reduce((prev, cur) => {
                    if (typeof cur.max === "number" && (prev === null || BigNumber(cur.max).gt(prev)))
                        return BigNumber(cur.max);
                    return prev;
                }, null);
            }
            const extraUsdToFitMinMax = BigNumber("1"); // We correct the limits as the exact limit can fluctuate and cause failed swap creation
            const coinUsdRate = await CoinsToFiatRatesService.getCoinToUSDRate(fromCoin);
            let extraCoinsToFitMinMax = "0";
            if (typeof coinUsdRate?.rate === "number" && coinUsdRate.rate > 0) {
                extraCoinsToFitMinMax = AmountUtils.trim(extraUsdToFitMinMax.div(coinUsdRate?.rate), fromCoin.digits);
            }
            if (smallestMin instanceof BigNumber) {
                smallestMin = AmountUtils.trim(smallestMin.plus(extraCoinsToFitMinMax), fromCoin.digits);
            }
            if (greatestMax instanceof BigNumber) {
                if (greatestMax > extraCoinsToFitMinMax) {
                    greatestMax = AmountUtils.trim(greatestMax.minus(extraCoinsToFitMinMax), fromCoin.digits);
                } else {
                    greatestMax = "0";
                }
            }

            if (availableExchanges.length) {
                const sorted = availableExchanges.sort((op1, op2) => op2.toAmount - op1.toAmount);
                const bestOpt = sorted[0];
                Logger.log(`Returning first option after sorting: ${safeStringify(bestOpt)}`, loggerSource);
                let max = null;
                let min = null;
                if (extraCoinsToFitMinMax != null) {
                    if (typeof bestOpt.max === "number" && bestOpt.max !== 0) {
                        max = BigNumber(bestOpt.max).minus(extraCoinsToFitMinMax);
                        max = AmountUtils.trim(max.lt(0) ? "0" : max, fromCoin.digits);
                    }
                    if (typeof bestOpt.min === "number" && bestOpt.min !== 0) {
                        min = AmountUtils.trim(BigNumber(bestOpt.min).plus(extraCoinsToFitMinMax), fromCoin.digits);
                    }
                }

                const rate =
                    bestOpt.toAmount && bestOpt.fromAmount ? BigNumber(bestOpt.toAmount).div(bestOpt.fromAmount) : null;
                return {
                    result: true,
                    min: min,
                    max: max,
                    smallestMin: smallestMin,
                    greatestMax: greatestMax,
                    rate: rate != null ? AmountUtils.trim(rate, this._maxRateDigits) : null,
                    durationMinutesRange: bestOpt.duration ?? null,
                    rawSwapData: bestOpt,
                };
            }
            const result = {
                result: false,
                reason:
                    smallestMin && BigNumber(amountCoins).lt(smallestMin)
                        ? SwapProvider.NO_SWAPS_REASONS.TOO_LOW
                        : greatestMax && BigNumber(amountCoins).gt(greatestMax)
                          ? SwapProvider.NO_SWAPS_REASONS.TOO_HIGH
                          : SwapProvider.NO_SWAPS_REASONS.NOT_SUPPORTED,
                smallestMin: smallestMin,
                greatestMax: greatestMax,
            };
            Logger.log(`Returning result ${safeStringify(result)}`, loggerSource);
            return result;
        } catch (e) {
            if (e?.response?.status === 429) {
                return { result: false, reason: SwapProvider.COMMON_ERRORS.REQUESTS_LIMIT_EXCEEDED };
            }
            Logger.log(`Internal swapspace/rabbit error when getting swap options ${safeStringify(e)}`, loggerSource);
            improveAndRethrow(e, loggerSource);
        }
    }

    async createSwap(fromCoin, toCoin, amount, toAddress, refundAddress, rawSwapData) {
        const loggerSource = "createSwap";
        const partner = rawSwapData?.partner;
        try {
            if (
                !(fromCoin instanceof Coin) ||
                !(toCoin instanceof Coin) ||
                typeof amount !== "string" ||
                typeof toAddress !== "string" ||
                typeof refundAddress !== "string"
            ) {
                throw new Error(`Invalid input: ${fromCoin} ${toCoin} ${amount} ${toAddress} ${refundAddress}`);
            }
            if (
                typeof partner !== "string" ||
                typeof rawSwapData?.fromCurrency !== "string" ||
                typeof rawSwapData?.fromNetwork !== "string" ||
                typeof rawSwapData?.toCurrency !== "string" ||
                typeof rawSwapData?.toNetwork !== "string" ||
                typeof rawSwapData?.id !== "string" // can be just empty
            ) {
                throw new Error(`Invalid raw swap data: ${safeStringify(rawSwapData)}`);
            }

            await this._fetchSupportedCurrenciesIfNeeded();
            const clientIp = await IpAddressProvider.getClientIpAddress();
            const toCurrencyExtraId = this._supportedCoins.find(item => item.coin === toCoin)?.extraId ?? "";
            const requestData = {
                partner: partner,
                fromCurrency: rawSwapData?.fromCurrency,
                fromNetwork: rawSwapData?.fromNetwork,
                toCurrency: rawSwapData?.toCurrency,
                toNetwork: rawSwapData?.toNetwork,
                address: toAddress,
                amount: amount,
                fixed: false,
                extraId: toCurrencyExtraId ?? "",
                rateId: rawSwapData?.id,
                userIp: clientIp,
                refund: refundAddress,
            };

            Logger.log(`Sending create request: ${safeStringify(requestData)}`, loggerSource);
            const response = await axios.post(`${this._URL}/api/v2/exchange`, requestData);
            const result = response.data;
            Logger.log(`Creation result ${safeStringify(result)}`, loggerSource);

            if (result?.id) {
                if (
                    typeof result?.from?.amount !== "number" ||
                    typeof result?.from?.address !== "string" ||
                    typeof result?.to?.amount !== "number" ||
                    typeof result?.to?.address !== "string"
                )
                    throw new Error(`Wrong swap creation result ${result}`);
                /* We use the returned rate preferably but if the retrieved
                 * rate 0/null/undefined we calculate it manually */
                let rate = result.rate;
                if (typeof rate !== "number" || BigNumber(rate).isZero()) {
                    rate = BigNumber(result?.to?.amount).div(result?.from?.amount);
                } else {
                    rate = BigNumber(rate);
                }

                return {
                    result: true,
                    swapId: result?.id,
                    fromCoin: fromCoin,
                    fromAmount: AmountUtils.trim(result?.from?.amount, fromCoin.digits),
                    fromAddress: result?.from?.address,
                    toCoin: toCoin,
                    toAmount: AmountUtils.trim(result?.to?.amount, toCoin.digits),
                    toAddress: result?.to?.address,
                    rate: AmountUtils.trim(rate, this._maxRateDigits),
                };
            }
            const errorMessage = `Swap creation succeeded but the response is wrong: ${safeStringify(response)}`;
            Logger.log(errorMessage, loggerSource);
            throw new Error(errorMessage);
        } catch (e) {
            Logger.log(`Failed to create swap. Error is: ${safeStringify(e)}`, loggerSource);
            const composeFailResult = reason => ({ result: false, reason: reason, partner: partner });
            const status = e?.response?.status;
            const data = e?.response?.data;
            if (status === 429) {
                Logger.log(`Returning fail - RPS limit exceeded ${data}`, loggerSource);
                return composeFailResult(SwapProvider.COMMON_ERRORS.REQUESTS_LIMIT_EXCEEDED);
            }
            const texts422 = [
                "Pair cannot be processed by",
                "Currency not found",
                "Amount maximum is",
                "Amount minimum is",
            ];
            const text403 = "IP address is forbidden";
            if (
                typeof data === "string" &&
                ((status === 403 && data.includes(text403)) ||
                    (status === 422 && texts422.find(text => data.includes(text))))
            ) {
                Logger.log(`Returning retriable fail: ${status} - ${data}, ${partner}`, loggerSource);
                return composeFailResult(SwapProvider.CREATION_FAIL_REASONS.RETRIABLE_FAIL);
            }
            Logger.log(`Internal swapspace/rabbit error for ${partner}: ${safeStringify(e)}`, loggerSource);
            improveAndRethrow(e, loggerSource);
        }
    }

    _fromSwapspaceCodeAndNetwork(code, network) {
        if (code === "btc" && network === "btc") return Coins.COINS.BTC;
        if (code === "eth" && network === "eth") return Coins.COINS.ETH;
        if (code === "trx" && network === "trx") return Coins.COINS.TRX;
        const protocol = network === "erc20" ? ERC20 : network === "trc20" ? TRC20 : null;
        if (!protocol) return null;
        const rabbitTicker = TickersAdapter.standardTickerToRabbitTicker(code, protocol.protocol);
        return Coins.getCoinByTickerIfPresent(rabbitTicker);
    }

    _mapSwapspaceStatusToRabbitStatus(status) {
        switch (status) {
            case "waiting":
                return SwapProvider.SWAP_STATUSES.WAITING_FOR_PAYMENT;
            case "confirming":
                return SwapProvider.SWAP_STATUSES.CONFIRMING;
            case "exchanging":
                return SwapProvider.SWAP_STATUSES.EXCHANGING;
            case "sending":
                return SwapProvider.SWAP_STATUSES.PAYMENT_RECEIVED;
            case "finished":
                return SwapProvider.SWAP_STATUSES.COMPLETED;
            case "verifying":
                return SwapProvider.SWAP_STATUSES.EXCHANGING;
            case "refunded":
                return SwapProvider.SWAP_STATUSES.REFUNDED;
            case "expired":
                return SwapProvider.SWAP_STATUSES.EXPIRED;
            case "failed":
                return SwapProvider.SWAP_STATUSES.FAILED;
            default:
                throw new Error(`Unknown swapspace status: ${status}`);
        }
    }

    async getExistingSwapsDetailsAndStatus(swapIds) {
        const loggerSource = "getExistingSwapsDetailsAndStatus";
        try {
            if (swapIds.find(id => typeof id !== "string")) {
                throw new Error("Swap id is not string: " + safeStringify(swapIds));
            }
            const getNotFailingOn404 = async swapId => {
                try {
                    return await axios.get(`${this._URL}/api/v2/exchange/${swapId}`);
                } catch (error) {
                    if (error?.response?.status === 404) return [];
                    throw error;
                }
            };
            const responses = await Promise.all(swapIds.map(swapId => getNotFailingOn404(swapId)));
            const wo404 = responses.flat();
            const swaps = wo404
                .map(r => r.data)
                .map((swap, index) => {
                    const fromCoin = this._fromSwapspaceCodeAndNetwork(swap.from.code, swap.from.network);
                    const toCoin = this._fromSwapspaceCodeAndNetwork(swap.to.code, swap.to.network);
                    if (!fromCoin || !toCoin) {
                        return []; // We skip swaps with not supported coins for now
                    }

                    const status = this._mapSwapspaceStatusToRabbitStatus(swap.status);
                    const toDigits = status === SwapProvider.SWAP_STATUSES.REFUNDED ? fromCoin.digits : toCoin.digits;
                    const addressToSendCoinsToSwapspace = swap.from.address;
                    const toUtcTimestamp = timeStr => Date.parse(timeStr.match(/.+[Zz]$/) ? timeStr : `${timeStr}Z`);
                    return new ExistingSwap(
                        swapIds[index],
                        status,
                        toUtcTimestamp(swap.timestamps.createdAt),
                        toUtcTimestamp(swap.timestamps.expiresAt),
                        swap.confirmations,
                        AmountUtils.trim(swap.rate, this._maxRateDigits),
                        swap.refundAddress,
                        addressToSendCoinsToSwapspace,
                        fromCoin,
                        AmountUtils.trim(swap.from.amount, fromCoin.digits),
                        swap.from.transactionHash,
                        swap.blockExplorerTransactionUrl.from,
                        toCoin,
                        AmountUtils.trim(swap.to.amount, toDigits),
                        swap.to.transactionHash,
                        swap.blockExplorerTransactionUrl.to,
                        swap.to.address,
                        swap.partner
                    );
                })
                .flat();
            Logger.log(`Swap details result ${safeStringify(swaps)}`, loggerSource);
            return { result: true, swaps: swaps };
        } catch (e) {
            Logger.log(`Failed to get swap details. Error is: ${safeStringify(e)}`, loggerSource);
            const composeFailResult = reason => ({ result: false, reason: reason });
            const status = e?.response?.status;
            const data = e?.response?.data;
            if (status === 429) {
                Logger.log(`Returning fail - RPS limit exceeded ${data}`, loggerSource);
                return composeFailResult(SwapProvider.COMMON_ERRORS.REQUESTS_LIMIT_EXCEEDED);
            }
            improveAndRethrow(e, loggerSource);
        }
    }
}
