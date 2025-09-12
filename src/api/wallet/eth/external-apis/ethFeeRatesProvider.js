import {
    improveAndRethrow,
    safeStringify,
    CachedRobustExternalApiCallerService,
    ExternalApiProvider,
    ApiGroups,
    Logger,
} from "@rabbitio/ui-kit";

import { Storage } from "../../../common/services/internal/storage.js";
import { Coins } from "../../coins.js";
import { SMALL_TTL_FOR_FREQ_CHANGING_DATA_MS } from "../../../common/utils/ttlConstants.js";
import { cache } from "../../../common/utils/cache.js";
import { API_KEYS_PROXY_URL } from "../../../common/backend-api/utils.js";
import { gweiDecimalPlaces } from "../ethereum.js";

class EthFeeRatesBlockNativeProvider extends ExternalApiProvider {
    constructor() {
        super("https://api.blocknative.com/gasprices/blockprices", "get", 7000, ApiGroups.BLOCKNATIVE);
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            Logger.log(
                "ETH fee rates raw blocknative:" + safeStringify(response?.data),
                "blocknative.feerates.getDataByResponse"
            );
            if (
                response.data?.blockPrices[0]?.estimatedPrices == null ||
                response.data?.blockPrices[0]?.baseFeePerGas == null
            ) {
                throw new Error("Wrong format of gas price returned by blocknative: " + safeStringify(response?.data));
            }
            const baseFeePerGas = response.data?.blockPrices[0]?.baseFeePerGas;
            const blocksData = response.data?.blockPrices[0]?.estimatedPrices;
            const optionsForMaxPriorityFeePerGas = [
                +blocksData[0].maxPriorityFeePerGas, // 99%
                +blocksData[1].maxPriorityFeePerGas, // 95%
                +blocksData[2].maxPriorityFeePerGas, // 90%
                +blocksData[3].maxPriorityFeePerGas, // 80%
            ];

            return {
                baseFeePerGas: +baseFeePerGas,
                optionsForMaxPriorityFeePerGas: optionsForMaxPriorityFeePerGas,
            };
        } catch (e) {
            improveAndRethrow(e, this.bio + ".getDataByResponse");
        }
    }
}

class EtherscanEthFeeRatesProvider extends ExternalApiProvider {
    constructor() {
        super("", "get", 15000, ApiGroups.ETHERSCAN);
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            return `${API_KEYS_PROXY_URL}/${this.apiGroup.backendProxyIdGenerator(Storage.getCurrentNetwork(Coins.COINS.ETH)?.key)}?module=gastracker&action=gasoracle`;
        } catch (e) {
            improveAndRethrow(e, "EtherscanEthFeeRatesProvider.composeQueryString");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            const data = response?.data?.result;
            Logger.log("ETH fee rates raw etherscan:" + safeStringify(data), "etherscan.feerates.getDataByResponse");

            if (
                data?.SafeGasPrice == null ||
                data?.ProposeGasPrice == null ||
                data?.FastGasPrice == null ||
                data?.suggestBaseFee == null
            ) {
                throw new Error("Wrong format of gas price returned by etherscan: " + safeStringify(data));
            }
            const baseFeePerGas = data?.suggestBaseFee;
            const midOption = ((+data.SafeGasPrice + +data.ProposeGasPrice) / 2).toFixed(gweiDecimalPlaces);
            const optionsForMaxPriorityFeePerGas = [
                +data.FastGasPrice,
                +data.ProposeGasPrice,
                +midOption,
                +data.SafeGasPrice,
            ].map(fullPrice => (fullPrice - baseFeePerGas < 0 ? 0 : fullPrice - baseFeePerGas));

            return {
                baseFeePerGas: +baseFeePerGas,
                optionsForMaxPriorityFeePerGas: optionsForMaxPriorityFeePerGas,
            };
        } catch (e) {
            improveAndRethrow(e, "EtherscanEthFeeRatesProvider.getDataByResponse");
        }
    }
}

export class EthFeeRatesProvider {
    constructor() {
        this.bio = "ethFeeRatesProvider";
        this._provider = new CachedRobustExternalApiCallerService(
            this.bio,
            cache,
            [new EthFeeRatesBlockNativeProvider(), new EtherscanEthFeeRatesProvider()],
            SMALL_TTL_FOR_FREQ_CHANGING_DATA_MS,
            false
        );
    }

    /**
     * Retrieves rates for eth gas price.
     * Base fee is the next block mandatory burning fee.
     * Options are priorityFeePerGas sorted by highest rate (and speed) descending.
     * All values are GWei numbers.
     *
     * @return {Promise<{ baseFeePerGas: number, optionsForMaxPriorityFeePerGas: number}[]>}
     */
    async retrieveEthFeeRates() {
        try {
            const rates = await this._provider.callExternalAPICached([], 10000);
            Logger.log("ETH fee rates, " + safeStringify(rates), "retrieveEthFeeRates");
            return rates;
        } catch (e) {
            improveAndRethrow(e, this.bio);
        }
    }
}

export const ethFeeRatesProvider = new EthFeeRatesProvider();
