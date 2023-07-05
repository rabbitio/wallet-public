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
     * @param [transactionType=null] {"in"|"out"|null} optional transaction type
     * @return {Promise<TransactionsHistoryItem|null>} transaction details or null
     */
    async getTransactionDetails(txId, transactionType = null) {
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
     * Validates given address for sending
     *
     * @param address {string} address to be validated
     * @return {{ result: true }|{ result: false, errorDescription: string|undefined, howToFix: string|undefined }}
     *         true if address is valid and false otherwise with optional details
     */
    isAddressValidForSending(address) {
        throw new Error("Not implemented in base Wallet class");
    }

    /**
     * TODO: [feature, critical] add constant for speed options count for all coins
     *
     * Creates 4 fake transactions options with different fee rates for confirmation speed selection.
     * Order of fee options is descending sorted by fee rate per option.
     *
     * Also, can return one option - it means this wallet doesn't support prioritisation for transactions.
     *
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
     * @returns {Promise<{ uuid: string, address: string, label: (string|null), creationTime: number }>} address and its data
     */
    async createNewAddress(label) {
        throw new Error("New address creation is not supported for " + this?.coin?.ticker);
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

    /**
     * Actualizes local caches with newly sent transaction data to operate with it immediately after send inside the app
     *
     * @param sentCoin {Coin} coin the transaction sent
     * @param txData {TxData} sent transaction details
     * @param txId {string} id of new transaction
     * @returns {void}
     */
    actualizeLocalCachesWithNewTransactionData(sentCoin, txData, txId) {
        throw new Error("Not implemented in base Wallet class");
    }

    /**
     * Marks cache for balance of this wallet as expired.
     * This method helps e.g. when you need to force this wallet to perform
     * balance retrieval/calculation despite on cache availability. But in case
     * of fail the cached value still can be used.
     */
    markBalanceCacheAsExpired() {
        throw new Error("Not implemented in base Wallet class");
    }

    /**
     * Marks cache for transactions of this wallet as expired.
     * This method helps e.g. when you need to force this wallet to perform
     * transactions retrieval/calculation despite on cache availability. But in case
     * of fail the cached value still can be used.
     */
    markTransactionsCacheAsExpired() {
        throw new Error("Not implemented in base Wallet class");
    }

    /**
     * Adds given amount of coin atoms to the cached balance.
     * Useful when we need to have the manually actualized balance for in-app
     * usage until the balance is requested from external services in background.
     *
     * @param amountAtoms {string} atoms number string to be added
     * @param [sign=-1] {number} sign of the amount passed to decide add it to cache or reduce the cache with it
     * @return {void}
     */
    actualizeBalanceCacheWithAmountAtoms(amountAtoms, sign = -1) {
        throw new Error("Not implemented in base Wallet class");
    }
}
