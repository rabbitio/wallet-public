import bitcoinJs from "bitcoinjs-lib";

export class BitcoinJsAdapter {
    static toBitcoinJsNetwork(networkKey) {
        if (networkKey === "mainnet") {
            return bitcoinJs.networks.bitcoin;
        } else if (networkKey === "testnet") {
            return bitcoinJs.networks.testnet;
        }

        throw new Error("Failed to get bitcoinjs network by key - key is not supported: " + networkKey);
    }
}
