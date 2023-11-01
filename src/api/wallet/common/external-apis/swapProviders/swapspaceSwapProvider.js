import axios from "axios";
import { SwapProvider } from "./swapProvider";
import { rabbitTickerToStandardTicker, standardTickerToRabbitTicker } from "../utils/tickersAdapter";
import { Coin } from "../../models/coin";
import { Coins } from "../../../coins";
import { improveAndRethrow } from "../../../../common/utils/errorUtils";
import IpAddressProvider from "../../../../auth/external-apis/ipAddressProviders";
import { Logger } from "../../../../support/services/internal/logs/logger";
import { safeStringify } from "../../../../common/utils/browserUtils";
import CoinsToFiatRatesService from "../../services/coinsToFiatRatesService";
import { AmountUtils } from "../../utils/amountUtils";
import { API_KEYS_PROXY_URL } from "../../../../common/backend-api/utils";

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
                            ticker = standardTickerToRabbitTicker(item.code, Coin.PROTOCOLS.ERC20.protocol);
                        } else if (network === "trc20") {
                            ticker = standardTickerToRabbitTicker(item.code, Coin.PROTOCOLS.TRC20.protocol);
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
            : coin.protocol === Coin.PROTOCOLS.TRC20
            ? "trc20"
            : coin.protocol === Coin.PROTOCOLS.ERC20
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
}
