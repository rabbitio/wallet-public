import { improveAndRethrow } from "@rabbitio/ui-kit";

import { TronNetworkConstantsProvider } from "../external-apis/tronNetworkConstantsProvider.js";

export class TronNetworkConstantsService {
    static defaultBandwidthPriceSuns = 1000;
    static defaultEnergyPriceSuns = 420;

    /**
     * @return {Promise<{bandwidthPriceSuns: number, energyPriceSuns: number}>}
     */
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
