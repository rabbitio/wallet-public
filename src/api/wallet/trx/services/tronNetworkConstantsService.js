import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { TronNetworkConstantsProvider } from "../external-apis/tronNetworkConstantsProvider";

export class TronNetworkConstantsService {
    static defaultBandwidthPriceSuns = 1000;
    static defaultEnergyPriceSuns = 420;

    static async getTronResourcesPrices() {
        try {
            const prices = await TronNetworkConstantsProvider.getTronNetworkConstants();
            return {
                energyPriceSuns: prices?.energyPriceSuns ?? this.defaultEnergyPriceSuns,
                bandwidthPriceSuns: prices.bandwidthPriceSuns ?? this.defaultBandwidthPriceSuns,
            };
        } catch (e) {
            improveAndRethrow(e, "getTronResourcesPrices");
        }
    }
}
