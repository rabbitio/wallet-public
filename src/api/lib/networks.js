import bitcoinJs from "bitcoinjs-lib";
import { SUPPORTED_NETWORKS_KEYS } from "../../properties";

export class Network {
    constructor(key, bitcoinjsNetwork, coinIndex, defaultAccountIndex, defaultGapLimit, defaultMinConfirmations) {
        this.key = key;
        this.bitcoinjsNetwork = bitcoinjsNetwork;
        this.coinIndex = coinIndex;
        this.defaultAccountIndex = defaultAccountIndex;
        this.defaultGapLimit = defaultGapLimit; // TODO: [refactoring, low] use it instead of constant
        this.defaultMinConfirmations = defaultMinConfirmations; // TODO: [refactoring, low] use it instead of constant
    }
}

export const mainnet = new Network("mainnet", bitcoinJs.networks.bitcoin, 0, 0, 20, 4);
export const testnet = new Network("testnet", bitcoinJs.networks.testnet, 1, 0, 20, 4);

/**
 * List of all networks that can be used inside the application
 * @type {Array<Network>}
 */
export const AllAvailableNetworks = [mainnet, testnet];

/**
 * List of network supported by running environment
 * @type {Array<Network>}
 */
export const SupportedNetworks = [mainnet, testnet]
    .map(network => (SUPPORTED_NETWORKS_KEYS.find(key => network.key === key) ? network : []))
    .flat();

/**
 * Useful for testing to customize a set of supported networks
 *
 * @param networks {Array<Network>}
 * @return {(Network|*)[]}
 */
export const setCustomSupportedNetworks = networks => {
    const memento = SupportedNetworks.map(item => item);
    SupportedNetworks.splice(0, SupportedNetworks.length);
    networks.forEach(item => SupportedNetworks.push(item));

    return memento;
};
