export class Wallet {
    /**
     * Creates the wallet
     *
     * @param coin {Coin} - the coin the wallet should correspond to
     * @param multipleAddressesSupport {boolean} - whether this wallet supports multiple addresses
     */
    constructor(coin, multipleAddressesSupport) {
        this.coin = coin;
        this.multipleAddressesSupport = multipleAddressesSupport;
    }

    /**
     * Calculates balance for this wallet's coin
     *
     * @return {Promise<number|string>} number or string in coin amount, not coin's atoms!!
     */
    async calculateBalance() {
        throw new Error("Not implemented in base Wallet class");
    }

    /**
     * Retrieves whole transactions history for current wallet
     *
     * @return {Promise<TransactionsHistoryItem[]>} list of history items
     */
    async getTransactionsList() {
        throw new Error("Not implemented in base Wallet class");
    }

    /**
     * Retrieves details for transaction by id
     *
     * @param txId {string} id of transaction to get the details for
     * @return {Promise<TransactionsHistoryItem|null>} transaction details or null
     */
    async getTransactionDetails(txId) {
        throw new Error("Not implemented in base Wallet class");
    }

    /**
     * Checks whether the tx with given id belongs to the wallet's coin
     *
     * @param txId {string} id of transaction to check the belonging for
     * @return {Promise<boolean>} true if the transaction is from the current wallet's network, false otherwise
     */
    async isTxBelongingToWalletsCoin(txId) {
        throw new Error("Not implemented in base Wallet class");
    }

    /**
     * Gets current address of wallet

     * @return {Promise<string>} address string
     */
    async getCurrentAddress() {
        throw new Error("Not implemented in base Wallet class");
    }

    /**
     * Validates given address
     *
     * @param address {string} address to be validated
     * @return {{result: boolean}} true if address is valid and false otherwise
     */
    isAddressValid(address) {
        throw new Error("Not implemented in base Wallet class");
    }

    /**
     * TODO: [feature, critical] add constant for speed options count for all coins
     *
     *  Creates 4 fake transactions options with different fee rates for confirmation speed selection
     * @param address {string} address to be validated
     * @param coinAmount {string} amount to be validated in coin denomination
     * @param isSendAll {boolean} whether transaction should send all available coins or not
     * @param currentNetwork {Network} coin to create the fake transaction for
     * @param balanceCoins {number|string} balance of coin we are creating transactions for
     * @return {Promise<
     *             {
     *                  result: true,
     *                  txsDataArray:
     *                      TxData[]
     *                      |
     *                      {
     *                          errorDescription: string,
     *                          howToFix: string
     *                      }[],
     *                  [isFeeCoinBalanceZero]: boolean,
     *                  [isFeeCoinBalanceNotEnoughForAllOptions]: boolean,
     *              }
     *              |
     *              {
     *                  result: false,
     *                  errorDescription: string,
     *                  howToFix: string
     *              }>
     *          }
     *          Returned value is ether object with txData array and optional flags about balance enough to cover fee
     *          or just error object. Each option can also be error object.
     *
     */
    async createTransactionsWithFakeSignatures(address, coinAmount, isSendAll, currentNetwork, balanceCoins) {
        throw new Error("Not implemented in base Wallet class");
    }

    /**
     * Creates transactions and broadcasts it to the network
     *
     * @param mnemonic {string} mnemonic words of this wallet
     * @param passphrase {string} passphrase string of this wallet
     * @param txData {TxData} data to create transaction
     * @return {Promise<string|{ errorDescription: string, howToFix: string }>} string id of created and pushed transaction or error object
     */
    async createTransactionAndBroadcast(mnemonic, passphrase, txData) {
        throw new Error("Not implemented in base Wallet class");
    }

    /**
     * Creates new address if the wallet supports multiple addresses
     *
     * @param [label] {string|null} optional label for address
     * @throws {Error} if wallet doesn't support multiple addresses (has multipleAddressesSupport === false)
     * @returns {Promise<{ uuid: string, address: string }>} address and its unique id
     */
    async createNewAddress(label) {
        throw new Error("Not implemented in base Wallet class");
    }

    /**
     * Exports addresses and private keys of current wallet by password
     *
     * @param password {string} password for this wallet
     * @return {Promise<{ address: string, privateKey: string }[]>} array of address -> privateKey mappings
     */
    async exportWalletData(password) {
        throw new Error("Not implemented in base Wallet class");
    }
}
