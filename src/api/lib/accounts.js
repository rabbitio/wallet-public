/**
 * Class to store accounts data in.
 *
 * Contains object allowing to store account public key and account change code by derivation
 * path (scheme, coin, account index).
 */
export class AccountsData {
    constructor(mnemonicOrSerializedData, password, schemes, networks, accountIndexes = []) {
        if (!password && !schemes && !networks) {
            this.accountsData = JSON.parse(mnemonicOrSerializedData);
        } else {
            this.accountsData = {};
            schemes.forEach(scheme => {
                this.accountsData[scheme.scheme] = {};
                networks.forEach(network => {
                    this.accountsData[scheme.scheme][network.coinIndex] = {};
                    if (!accountIndexes.length) {
                        accountIndexes = [network.defaultAccountIndex];
                    }
                    accountIndexes.forEach(accountIndex => {
                        this.accountsData[scheme.scheme][network.coinIndex][accountIndex] = scheme.generateAccountKeys(
                            mnemonicOrSerializedData,
                            password,
                            network.coinIndex,
                            accountIndex
                        );
                    });
                });
            });
        }
    }

    getAccountData(scheme, network, accountIndex) {
        if (((this.accountsData[scheme.scheme] ?? {})[network.coinIndex] ?? {})[accountIndex] === undefined) {
            throw new Error(
                `Cannot get accounts data for given account as it was not passed during the creation of accounts data: sch: ${scheme.scheme}, net: ${network.key}, acc:${accountIndex}`
            );
        }

        return this.accountsData[scheme.scheme][network.coinIndex][accountIndex];
    }

    serialize() {
        return JSON.stringify(this.accountsData);
    }
}
