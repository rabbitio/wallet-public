import axios from "axios";
import { SwapProvider } from "./swapProvider";
import {
    rabbitTickerToStandardTicker,
    standardTickerToRabbitTicker,
} from "../../wallet/common/external-apis/utils/tickersAdapter";
import { Coin } from "../../wallet/common/models/coin";
import { Coins } from "../../wallet/coins";
import { improveAndRethrow } from "../../common/utils/errorUtils";
import IpAddressProvider from "../../auth/external-apis/ipAddressProviders";
import { Logger } from "../../support/services/internal/logs/logger";
import { safeStringify } from "../../common/utils/browserUtils";
import CoinsToFiatRatesService from "../../wallet/common/services/coinsToFiatRatesService";
import { AmountUtils } from "../../wallet/common/utils/amountUtils";
import { API_KEYS_PROXY_URL } from "../../common/backend-api/utils";
import { TRC20 } from "../../wallet/trc20token/trc20Protocol";
import { ERC20 } from "../../wallet/erc20token/erc20Protocol";
import { ExistingSwap } from "../models/existingSwap";

export const BANNED_PARTNERS = ["stealthex"];

export class SwapspaceSwapProvider extends SwapProvider {
    constructor() {
        super();
        this._supportedCoins = [];
        this._URL = `${API_KEYS_PROXY_URL}/swapspace`;
    }

    getSwapDetailsTtlMs() {
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
                        const network = item.network;
                        let ticker = null;
                        if (network === "eth" && item.code === "eth") {
                            ticker = Coins.COINS.ETH.ticker;
                        } else if (network === "trx" && item.code === "trx") {
                            ticker = Coins.COINS.TRX.ticker;
                        } else if (network === "btc" && item.code === "btc") {
                            ticker = Coins.COINS.BTC.ticker;
                        } else if (network === "erc20") {
                            ticker = standardTickerToRabbitTicker(item.code, ERC20.protocol);
                        } else if (network === "trc20") {
                            ticker = standardTickerToRabbitTicker(item.code, TRC20.protocol);
                        }

                        if (
                            ticker != null &&
                            Coins.getSupportedCoinsTickers().find(supported => supported === ticker)
                        ) {
                            return {
                                coin: Coins.getCoinByTicker(ticker),
                                extraId: item.hasExtraId ? item.extraIdName : "",
                            };
                        }

                        return [];
                    })
                    .flat();
            }
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
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
                !fromCoin instanceof Coin ||
                !toCoin instanceof Coin ||
                typeof amountCoins !== "number" ||
                amountCoins < 0
            ) {
                throw new Error(`Wrong input params: ${amountCoins} ${fromCoin.ticker} -> ${toCoin.ticker}`);
            }
            const fromTicker = rabbitTickerToStandardTicker(fromCoin.ticker, fromCoin.protocol).toLowerCase();
            const fromNetwork = this._toSwapspaceNetwork(fromCoin);
            const toTicker = rabbitTickerToStandardTicker(toCoin.ticker, toCoin.protocol).toLowerCase();
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
            if (exchangesSupportingThePair.find(ex => ex.min === 0) == null)
                smallestMin = exchangesSupportingThePair.reduce(
                    (prev, cur) => (typeof cur.min === "number" && (prev === null || cur.min < prev) ? cur.min : prev),
                    null
                );
            let greatestMax = null;
            if (exchangesSupportingThePair.find(ex => ex.max === 0) == null)
                greatestMax = exchangesSupportingThePair.reduce(
                    (prev, cur) => (typeof cur.max === "number" && (prev === null || cur.max > prev) ? cur.max : prev),
                    null
                );
            const usdAmountForSaferMinMaxLimits = 1; // We correct limits as the exact limit can fluctuate and cause failed swap creation
            const coinUsdRate = await CoinsToFiatRatesService.getCoinToUSDRate(fromCoin);
            const coinAmountForMinMaxSafety =
                typeof coinUsdRate?.rate === "number" && coinUsdRate.rate > 0
                    ? AmountUtils.trimCryptoAmountByCoin(usdAmountForSaferMinMaxLimits / +coinUsdRate?.rate, fromCoin)
                    : 0;
            if (smallestMin != null) smallestMin += coinAmountForMinMaxSafety;
            if (greatestMax != null) {
                if (greatestMax > coinAmountForMinMaxSafety) greatestMax -= coinAmountForMinMaxSafety;
                else greatestMax = 0;
            }
            if (availableExchanges.length) {
                const sorted = availableExchanges.sort((op1, op2) => op2.toAmount - op1.toAmount);
                const bestRateOption = sorted[0];
                Logger.log(`Returning first option after sorting: ${safeStringify(bestRateOption)}`, loggerSource);
                const max =
                    typeof bestRateOption.max !== "number" || bestRateOption.max === 0
                        ? null
                        : bestRateOption.max - coinAmountForMinMaxSafety;
                const min =
                    typeof bestRateOption.min !== "number" || bestRateOption.min === 0
                        ? null
                        : bestRateOption.min + coinAmountForMinMaxSafety;
                return {
                    result: true,
                    min: min,
                    max: max == null ? null : max < 0 ? 0 : max,
                    smallestMin: smallestMin,
                    greatestMax: greatestMax,
                    rate:
                        bestRateOption.toAmount && bestRateOption.fromAmount
                            ? bestRateOption.toAmount / bestRateOption.fromAmount
                            : null,
                    durationMinutesRange: bestRateOption.duration ?? null,
                    rawSwapData: bestRateOption,
                };
            }
            const result = {
                result: false,
                reason:
                    smallestMin && amountCoins < smallestMin
                        ? SwapProvider.NO_SWAPS_REASONS.TOO_LOW
                        : greatestMax && amountCoins > greatestMax
                        ? SwapProvider.NO_SWAPS_REASONS.TOO_HIGH
                        : SwapProvider.NO_SWAPS_REASONS.NOT_SUPPORTED,
                smallestMin: smallestMin ?? null,
                greatestMax: greatestMax ?? null,
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
                typeof amount !== "number" ||
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
                if (typeof rate !== "number" || rate === 0) {
                    rate = result?.to?.amount / result?.from?.amount;
                }

                return {
                    result: true,
                    swapId: result?.id,
                    fromCoin: fromCoin,
                    fromAmount: result?.from?.amount,
                    fromAddress: result?.from?.address,
                    toCoin: toCoin,
                    toAmount: result?.to?.amount,
                    toAddress: result?.to?.address,
                    rate: rate,
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
        if (code === "btc") return Coins.COINS.BTC;
        if (code === "eth") return Coins.COINS.ETH;
        if (code === "trx") return Coins.COINS.TRX;
        const protocol = network === "erc20" ? ERC20 : network === "trc20" ? TRC20 : null;
        if (!protocol) throw new Error("Unknown swapspace network: " + network);
        const coin = Coins.getCoinByTicker(standardTickerToRabbitTicker(code, protocol.protocol));
        if (!coin) throw new Error("Unknown coin from swapspace: " + code + ", " + network);
        return coin;
    }

    _mapSwapspaceStatusToRabbitStatus(status) {
        switch (status) {
            case "waiting":
                return SwapProvider.SWAP_STATUSES.WAITING_FOR_PAYMENT;
            case "confirming":
                return SwapProvider.SWAP_STATUSES.WAITING_FOR_PAYMENT;
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
            const responses = await Promise.all(
                swapIds.map(swapId => axios.get(`${this._URL}/api/v2/exchange/${swapId}`))
            );
            const swaps = responses
                .map(r => r.data)
                .map(
                    (swap, index) =>
                        new ExistingSwap(
                            swapIds[index],
                            this._mapSwapspaceStatusToRabbitStatus(swap.status),
                            new Date(swap.timestamps.createdAt).getTime(),
                            new Date(swap.timestamps.expiresAt).getTime(),
                            swap.confirmations,
                            swap.rate,
                            swap.refundAddress,
                            this._fromSwapspaceCodeAndNetwork(swap.from.code, swap.from.network),
                            swap.from.amount,
                            swap.from.transactionHash,
                            this._fromSwapspaceCodeAndNetwork(swap.to.code, swap.to.network),
                            swap.to.amount,
                            swap.to.transactionHash,
                            swap.to.address,
                            swap.partner
                        )
                );
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
