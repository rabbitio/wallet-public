export class Wallet {
    /**
     * Creates the wallet
     *
     * WARNING: we use singleton wallet objects all over the app. Don't create custom instances.
     * Use only predefined singleton Wallet (or descendants) instances.
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
     * @return {Promise<string>} string in coin amount, not coin's atoms!!
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
     * Validates address for the coin of this wallet.
     *
     * @param address {string}
     * @return {{result:boolean}} true if address is valid for the wallet's coin
     */
    isAddressValid(address) {
        throw new Error("Not implemented in base Wallet class");
    }

    /**
     * Validates given address for sending.
     * This method should be used prior to the ordinary validation when
     * you check the address is technically supported to send coins to it.
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
     * @param address {string} target address
     * @param coinAmount {string} amount to be sent
     * @param isSendAll {boolean} whether transaction should send all available coins or not
     * @param currentNetwork {Network} network to create the fake transaction for
     * @param balanceCoins {string} balance of coin we are creating transactions for
     * @param [isAddressFake=false] use this flag if the target address passed is not the same you plan to actually
     *                              use when sending transaction. It can affect fee estimation.
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
     *          Returned value is ether object with txData array and optional flags or just error object.
     *          1. The result is false and contain error details: means that the calculation process failed
     *          2. Result is true, isFeeCoinBalanceNotEnoughForAllOptions is false and there are no options
     *             containing error object: means all options can be used to send a transaction.
     *          3. Result is true, isFeeCoinBalanceNotEnoughForAllOptions is false and there are some options
     *             containing error object: means some options can be used and some cannot because e.g. we
     *             have no enough coins to cover these options.
     *          4. Result is true and isFeeCoinBalanceNotEnoughForAllOptions is true - all options are not error
     *             objects but they cannot be used for transaction sending - such options just to demonstrate
     *             the fee for some standard transaction.
     */
    async createTransactionsWithFakeSignatures(
        address,
        coinAmount,
        isSendAll,
        currentNetwork,
        balanceCoins,
        isAddressFake = false
    ) {
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
     * @deprecated @since 0.8.0 - we switched to use single address for bitcoin (was the only coin
     * supporting multiple addresses) but we left the multiple addresses creation under the hood when importing
     * a bitcoin wallet.
     *
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

    /**
     * Returns change address only for wallets supporting outputs. Returns null by default.
     *
     * @return {Promise<string|null>}
     */
    async getCurrentChangeAddressIfSupported() {
        return new Promise((resolve, reject) => resolve(null));
    }
}
