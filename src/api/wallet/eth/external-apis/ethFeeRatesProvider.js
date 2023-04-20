import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";
import { ApiGroups } from "../../../common/external-apis/apiGroups";
import { getCurrentNetwork } from "../../../common/services/internal/storage";
import { Coins } from "../../coins";
import { safeStringify } from "../../../common/utils/browserUtils";

class EthFeeRatesBlockNativeProvider extends ExternalApiProvider {
    constructor() {
        super("https://api.blocknative.com/gasprices/blockprices", "get", 7000, ApiGroups.BLOCKNATIVE);
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
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

class EthFeeRatesEthGasStationProvider extends ExternalApiProvider {
    constructor() {
        super("https://api.ethgasstation.info/api/fee-estimate", "get", 7000, ApiGroups.ETHGASSTATION);
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            if (
                response.data?.priorityFee?.fast == null ||
                response.data?.priorityFee?.instant == null ||
                response.data?.priorityFee?.standard == null ||
                response.data?.nextBaseFee == null
            ) {
                throw new Error("Wrong format of price returned by eth gas station: " + safeStringify(response?.data));
            }
            const baseFeePerGas = response.data?.nextBaseFee;
            const midOption = Math.ceil(
                (+response.data?.priorityFee?.fast + +response.data?.priorityFee?.standard) / 2
            );
            const optionsForMaxPriorityFeePerGas = [
                +response.data?.priorityFee?.instant,
                +response.data?.priorityFee?.fast,
                +midOption,
                +response.data?.priorityFee?.standard,
            ];

            return {
                baseFeePerGas: +baseFeePerGas,
                optionsForMaxPriorityFeePerGas: optionsForMaxPriorityFeePerGas,
            };
        } catch (e) {
            improveAndRethrow(e, "ethFeeRatesEthGasStationProvider.getDataByResponse");
        }
    }
}

class EtherscanEthFeeRatesProvider extends ExternalApiProvider {
    constructor() {
        super("", "get", 15000, ApiGroups.ETHERSCAN);
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const networkPrefix = getCurrentNetwork(Coins.COINS.ETH) === Coins.COINS.ETH.mainnet ? "" : "-goerli";
            // NOTE: add api key if you decide to use paid API '&apikey=YourApiKeyToken'
            return `https://api${networkPrefix}.etherscan.io/api?module=gastracker&action=gasoracle`;
        } catch (e) {
            improveAndRethrow(e, "EtherscanEthFeeRatesProvider.composeQueryString");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            const data = response?.data?.result;
            if (
                data?.SafeGasPrice == null ||
                data?.ProposeGasPrice == null ||
                data?.FastGasPrice == null ||
                data?.suggestBaseFee == null
            ) {
                throw new Error("Wrong format of gas price returned by etherscan: " + safeStringify(data));
            }
            const baseFeePerGas = data?.suggestBaseFee;
            const midOption = Math.ceil((+data.SafeGasPrice + +data.ProposeGasPrice) / 2);
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
            [
                new EthFeeRatesBlockNativeProvider(),
                new EthFeeRatesEthGasStationProvider(),
                new EtherscanEthFeeRatesProvider(),
            ],
            30000,
            35,
            1000
        );
    }

    /**
     * Retrieves rates for eth gas price.
     * Base fee is the next block mandatory burning fee.
     * Options are priorityFeePerGas sorted by highest rate (and speed) descending.
     * All values are GWei numbers.
     *
     * @return {Promise<{ baseFeePerGas: number, optionsForMaxPriorityFeePerGas: number[]}>}
     */
    async retrieveEthFeeRates() {
        try {
            return await this._provider.callExternalAPICached([], 10000);
        } catch (e) {
            improveAndRethrow(e, this.bio);
        }
    }
}

export const ethFeeRatesProvider = new EthFeeRatesProvider();
