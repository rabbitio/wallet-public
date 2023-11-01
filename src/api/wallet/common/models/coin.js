import { Blockchain } from "./blockchain";
import { Protocol } from "./protocol";

/**
 * The model for cryptocurrency coins.
 *
 * WARNING: this class should not be instantiated directly. Use only predefined singleton Coin (or descendants) instances.
 */
export class Coin {
    /**
     * Creates new coin
     *
     * @param latinName {string} the coin name in latin symbols like "Bitcoin"
     * @param ticker {string} the coin symbol/ticker/code like 'BTC'. Always upper case. A unique coin identifier
     * @param tickerPrintable {string} ticker but in printable format. Useful for tokens based on external blockchains
     *        like ERC20 or TRC20. It is not friendly to display USDTERC20 or BUSDTRC20 - more neat options are just
     *        USDT and BUSD. Note that you should always care about user's understanding of what coin he/she is working
     *        with as printable ticker for USDTERC20 and USDTTRC20 are the same.
     * @param digitsCountAfterComma {number} count of digits after the comma. E.g. 8 for bitcoin
     * @param maxValue {number|null} max possible value for cryptocurrency. Null means that the currency has no max possible value
     * @param atomName {string} name of the coin's atomic value. Like 'satoshi' for bitcoin
     * @param mainnet {Network} main network for this coin
     * @param testnet {Network} test network for this coin
     * @param minConfirmations {number} min confirmations count to treat the coin's transaction confirmed
     * @param payableEntityStringForFeeRate {string|null} the payable fee entity like byte for bitcoin or gas for ether if present
     * @param feeOptionsTimeStringsSortedDesc {string[]} array of 4 strings for fee options when sending coins. Should be sorted from the highest time to the smallest
     * @param feeRatesExpirationTimeMs {number} number of milliseconds to treat the fee rates as expired
     * @param blockchain {Blockchain} blockchain object
     * @param [protocol] {Protocol|null} token/coin protocol if relevant
     * @param [tokenAddress] {string|null} address of contract of this token (if the coin is token)
     * @param [doesUseLowerCaseAddresses] {boolean} flag to clarify whether we can use lower case addresses to ensure more robust comparisons
     * @param [doesUseOutputs=false] {boolean} true if this coin uses inputs/outputs concept and false if it uses just balances
     */
    constructor(
        latinName,
        ticker,
        tickerPrintable,
        digitsCountAfterComma,
        maxValue,
        atomName,
        mainnet,
        testnet,
        minConfirmations,
        payableEntityStringForFeeRate,
        feeOptionsTimeStringsSortedDesc,
        feeRatesExpirationTimeMs,
        blockchain,
        protocol = null,
        tokenAddress = null,
        doesUseLowerCaseAddresses = true,
        doesUseOutputs = false
    ) {
        this.latinName = latinName;
        this.ticker = ticker;
        this.tickerPrintable = tickerPrintable;
        this.digits = digitsCountAfterComma;
        this.maxValue = maxValue;
        this.atomName = atomName;
        this.mainnet = mainnet;
        this.testnet = testnet;
        this.minConfirmations = minConfirmations;
        this.payableEntityStringForFeeRate = payableEntityStringForFeeRate;
        this.feeOptionsTimeStringsSortedDesc = feeOptionsTimeStringsSortedDesc;
        this.feeRatesExpirationTimeMs = feeRatesExpirationTimeMs;
        this.protocol = protocol;
        this.blockchain = blockchain;
        // TODO: [bug, critical] use testnet property for testnet contract address as it blocks the app work in testnets
        this.tokenAddress = tokenAddress;
        this.feeCoin = this;
        this._significantDigits = 8;
        this.doesUseLowerCaseAddresses = doesUseLowerCaseAddresses;
        this.doesUseOutputs = doesUseOutputs;
    }

    static PROTOCOLS = {
        ERC20: new Protocol("ERC20"),
        TRC20: new Protocol("TRC20"),
    };

    static BLOCKCHAINS = {
        BITCOIN: new Blockchain("Bitcoin blockchain", []),
        ETHEREUM: new Blockchain("Ethereum blockchain", [this.PROTOCOLS.ERC20]),
        TRON: new Blockchain("Tron blockchain", [this.PROTOCOLS.TRC20]),
    };

    /**
     * Sets fee coin
     *
     * @param feeCoin {Coin} some tokens use another coin to charge transaction fee as they work on top of some external
     *        blockchain. So pass here the coin the token uses for fee charging. Like for ERC20 token the fee coin is ETH.
     *        By default, the creating coin will be set as a value for this field.
     */
    setFeeCoin(feeCoin) {
        this.feeCoin = feeCoin;
    }

    /**
     * Checks whether this coin uses another coin (blockchain) to charge fee for transactions (means works on base of
     * some external blockchain).
     *
     * @return {boolean} true if this coin uses external blockchain to perform transactions and charge fee
     */
    doesUseDifferentCoinFee() {
        return this.feeCoin !== this;
    }

    /**
     * Converts the given atoms string/number to string representing the same amount in coin itself - floating point number
     *
     * @param atoms {string} atoms positive integer amount
     * @return {string} coin amount floating point number as a string
     */
    atomsToCoinAmount(atoms) {
        throw new Error("Not implemented in base Coin");
    }

    /**
     * Converts the given atoms string/number to string representing the same amount in coin itself - floating point
     * number with only significant digits after the dot
     *
     * @param atoms {string} atoms positive integer amount
     * @param [maxNumberLength=null] {number|null} max length of target formatted number
     * @return {string} coin amount floating point number as a string having only significant digits after the dot
     */
    atomsToCoinAmountSignificantString(atoms, maxNumberLength = null) {
        throw new Error("Not implemented in base Coin");
    }

    /**
     * Converts the given coins amount string/number to string representing the same amount in coin atoms - integer number
     *
     * @param coinsAmount {string|number} coins positive floating point amount
     * @return {string} coin atoms amount integer number as a string
     */
    coinAmountToAtoms(coinsAmount) {
        throw new Error("Not implemented in base Coin");
    }

    /**
     * Composes URL to view the tx with given id in the external blockchain explorer
     *
     * @param txId {string} id of transaction
     * @return {string} URL string
     */
    composeUrlToTransactionExplorer(txId) {
        throw new Error("Not implemented in base Coin");
    }

    /**
     * Most of the cryptocurrencies has specific fee rate or fee price metric. This value usually has specific measure
     * like satoshi/byte or gWei/gas. This function adds the described denomination string to the given amount
     * as a suffix and returns the result string ready to be show to a user.
     *
     * @param coinAtomsString {string|number} coin atoms positive integer amount
     * @return {string} string of coin amount and fee rate units
     */
    coinAtomsFeeRateToCommonlyUsedAmountFormatWithDenominationString(coinAtomsString) {
        throw new Error("Not implemented in base Coin");
    }

    /**
     * Check whether this coin support transaction prioritisation during the sending process.
     *
     * @return {boolean} true if support transaction prioritisation and false otherwise
     */
    doesSupportTransactionPrioritisation() {
        return Array.isArray(this.feeOptionsTimeStringsSortedDesc);
    }
}
