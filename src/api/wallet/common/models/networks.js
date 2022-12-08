export class Network {
    /**
     * Represents the network concept. Coin can have several networks like main network, test network etc.
     *
     * @param key {string} the network's key like "mainnet"
     * @param coinIndex {number} not negative integer used for the coin this network belongs to for derivation like bip44
     * @param defaultAccountIndex {number} not negative integer used as the default account index for derivations
     * @param defaultGapLimit {number} the number of addresses to scan until the address usage (transaction) found
     *        (for coins that uses multiple addresses from derivation)
     * @param defaultMinConfirmations {number} not negative integer representing minimal confirmations for transaction
     *        in this network
     * @param supportedSchemes {Scheme[]} the not-empty array of derivation schemes that this network can be use for
     */
    constructor(key, coinIndex, defaultAccountIndex, defaultGapLimit, defaultMinConfirmations, supportedSchemes) {
        this.key = key;
        this.coinIndex = coinIndex;
        this.defaultAccountIndex = defaultAccountIndex;
        this.supportedSchemes = supportedSchemes;
        this.defaultGapLimit = defaultGapLimit; // TODO: [refactoring, low] use it instead of constant
        this.defaultMinConfirmations = defaultMinConfirmations; // TODO: [refactoring, low] use it instead of constant
    }

    /**
     * Checks whether this network supports giving derivation scheme
     *
     * @param scheme {Scheme} derivation scheme object
     * @return {boolean} true if supports and false otherwise
     */
    doesSupportScheme(scheme) {
        return this.supportedSchemes.indexOf(scheme) > -1;
    }
}
