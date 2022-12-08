import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";

class EthFeeRatesBlockNativeProvider extends ExternalApiProvider {
    getDataByResponse(response, params = [], subRequestIndex = 0) {
        try {
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
    getDataByResponse(response, params = [], subRequestIndex = 0) {
        try {
            const baseFeePerGas = response.data?.nextBaseFee;
            const midOption = Math.ceil((response.data?.priorityFee?.fast + response.data?.priorityFee?.instant) / 2);
            const optionsForMaxPriorityFeePerGas = [
                +response.data?.priorityFee?.fast,
                +midOption,
                +response.data?.priorityFee?.instant,
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

export class EthFeeRatesProvider {
    constructor() {
        this.bio = "ethFeeRatesProvider";
        this.timeoutMs = 7000;
        this._provider = new CachedRobustExternalApiCallerService(
            this.bio,
            [
                new EthFeeRatesBlockNativeProvider(
                    "https://api.blocknative.com/gasprices/blockprices",
                    "get",
                    this.timeoutMs,
                    0.5
                ),
                new EthFeeRatesEthGasStationProvider(
                    "https://api.ethgasstation.info/api/fee-estimate",
                    "get",
                    this.timeoutMs,
                    0.5
                ),
            ],
            20000,
            30,
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
            return await this._provider.callExternalAPICached([], this.timeoutMs);
        } catch (e) {
            improveAndRethrow(e, this.bio);
        }
    }
}

export const ethFeeRatesProvider = new EthFeeRatesProvider();
