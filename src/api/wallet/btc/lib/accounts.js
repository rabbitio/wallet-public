/**
 * Class to store accounts data in.
 *
 * Contains object allowing to store account public key and account change code by derivation
 * path (scheme, coin, account index).
 */
export class AccountsData {
    /**
     * Creates accounts data on base of credentials or serialized data.
     * When serialized data passed the accounts data is related just by deserializing it.
     * When mnemonic and other params are passed the accounts data is generated for each scheme and each network
     * supporting the scheme.
     *
     * @param mnemonicOrSerializedData {string} ether mnemonic phrase or serialized accounts data string
     * @param password {string} password for mnemonic (aka custom words, passphrase)
     * @param schemes {Scheme[]} array of Schemes to create accounts data for
     * @param networks {Network[]}  array of networks to create accounts data for
     * @param [accountIndexes] {number[]} array of account indexes to get the data for
     */
    constructor(mnemonicOrSerializedData, password, schemes, networks, accountIndexes = []) {
        if (!password && !schemes && !networks) {
            this.accountsData = JSON.parse(mnemonicOrSerializedData);
        } else {
            this.accountsData = {};
            schemes.forEach(scheme => {
                this.accountsData[scheme.scheme] = {};
                networks.forEach(network => {
                    if (network.doesSupportScheme(scheme)) {
                        this.accountsData[scheme.scheme][network.coinIndex] = {};
                        if (!accountIndexes.length) {
                            accountIndexes = [network.defaultAccountIndex];
                        }
                        accountIndexes.forEach(accIndex => {
                            const keysData = scheme.generateAccountKeys(
                                mnemonicOrSerializedData,
                                password,
                                network.coinIndex,
                                accIndex
                            );
                            this.accountsData[scheme.scheme][network.coinIndex][accIndex] = {
                                publicKeyHex: keysData.publicKeyHex,
                                chainCodeHex: keysData.chainCodeHex,
                            };
                        });
                    }
                });
            });
        }
    }

    /**
     * Retrieves account data for exact scheme, network and account index.
     *
     * @param scheme {Scheme} scheme to get data for
     * @param network {Network} network to get data for
     * @param accountIndex {number} not-negative integer account number to get data for
     * @return {{publicKeyHex: string, chainCodeHex: string}} account data for given params
     */
    getAccountData(scheme, network, accountIndex) {
        if (((this.accountsData[scheme.scheme] ?? {})[network.coinIndex] ?? {})[accountIndex] === undefined) {
            throw new Error(
                `Cannot get accounts data for given account as it was not passed during the creation of accounts data: sch: ${scheme.scheme}, coin: ${network.coinIndex}, net: ${network.key}, acc:${accountIndex}`
            );
        }

        return this.accountsData[scheme.scheme][network.coinIndex][accountIndex];
    }

    serialize() {
        return JSON.stringify(this.accountsData);
    }
}
