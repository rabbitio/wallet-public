import { ethers } from "ethers";
import { BigNumber } from "bignumber.js";

import { AmountUtils, improveAndRethrow, safeStringify, Logger } from "@rabbitio/ui-kit";

import { TxData } from "../../common/models/tx-data.js";
import { Storage } from "../../../common/services/internal/storage.js";
import { Coins } from "../../coins.js";
import { KeysBip44 } from "../../common/lib/keysBip44.js";
import { ethFeeRatesProvider } from "../external-apis/ethFeeRatesProvider.js";
import { EthBalanceService } from "./ethBalanceService.js";
import { Erc20transactionUtils } from "../../erc20token/lib/erc20transactionUtils.js";
import { EthereumPushTransactionProvider } from "../external-apis/ethereumPushTransactionProvider.js";
import { EthereumTransactionsCountProvider } from "../external-apis/ethereumTransactionsCountProvider.js";
import { EthAddressesService } from "./ethAddressesService.js";
import { EthereumBlockchainFeeDataProvider } from "../external-apis/ethereumBlockchainFeeDataProvider.js";
import { gweiDecimalPlaces } from "../ethereum.js";

export class EthSendTransactionService {
    static GAS_LIMIT_FOR_ETHER_TRANSFER = "21000";

    /**
     * Validates address and amount and tries to create transactions for 4 speed options with fake signatures
     * Composes TxData ready for sending for further usage if all is ok.
     *
     * TxData objects are sorted by gas price descending.
     *
     * @param coin {Coin} coin to create fake txs options for
     * @param address {string} address to be validated
     * @param coinAmount {string|null} amount to be validated in coin denomination, null for isSendAll=true
     * @param isSendAll {boolean} whether transaction should send all available coins or not
     * @param network {Network} coin to create the fake transaction for
     * @param balanceCoins {string} balance of coin we are creating transactions for
     * @param gasLimit {string} amount of gas units these transactions are aiming to spend
     * @return {Promise<
     *         {
     *             result: true,
     *             txsDataArray:
     *                 TxData[]
     *                 |
     *                 {
     *                     errorDescription: string,
     *                     howToFix: string
     *                 }[],
     *             isFeeCoinBalanceZero: boolean,
     *             isFeeCoinBalanceNotEnoughForAllOptions: boolean,
     *         }>}
     *         Each correctly calculated TxData contain "rate" filed filled with the object
     *         { rate: string, maxPriorityFeePerGasWei: string } (rate in wei)
     */
    static async createEthereumBlockchainCoinTransactionsWithFakeSignatures(
        coin,
        address,
        coinAmount,
        isSendAll,
        network,
        balanceCoins,
        gasLimit = this.GAS_LIMIT_FOR_ETHER_TRANSFER
    ) {
        try {
            const sendBalanceAtoms = coin.coinAmountToAtoms(balanceCoins);
            let feeBalance = coin.doesUseDifferentCoinFee() ? await EthBalanceService.getEthWalletBalance() : null;
            const feeBalanceAtoms = feeBalance == null ? sendBalanceAtoms : coin.feeCoin.coinAmountToAtoms(feeBalance);
            const { baseFeePerGas, optionsForMaxPriorityFeePerGas } = await ethFeeRatesProvider.retrieveEthFeeRates();

            let result;
            let isAtLeastOneOptionCoverable;
            if (
                typeof baseFeePerGas !== "number" ||
                optionsForMaxPriorityFeePerGas.find(option => typeof option !== "number")
            ) {
                const data = await optsForOneRate(
                    network,
                    gasLimit,
                    coinAmount,
                    isSendAll,
                    sendBalanceAtoms,
                    feeBalanceAtoms,
                    address,
                    coin
                );
                result = data.result;
                isAtLeastOneOptionCoverable = data.isAtLeastOneOptionCoverable;
            } else {
                const data = optsForSeveralRates(
                    optionsForMaxPriorityFeePerGas,
                    AmountUtils.trim(baseFeePerGas, gweiDecimalPlaces),
                    gasLimit,
                    coinAmount,
                    isSendAll,
                    sendBalanceAtoms,
                    feeBalanceAtoms,
                    coin,
                    address,
                    network
                );
                isAtLeastOneOptionCoverable = data.isAtLeastOneOptionCoverable;
                result = data.result;
            }
            result.isFeeCoinBalanceZero = BigNumber(feeBalanceAtoms).isZero();
            result.isFeeCoinBalanceNotEnoughForAllOptions = !isAtLeastOneOptionCoverable;

            return result;
        } catch (e) {
            improveAndRethrow(e, "createEthereumBlockchainCoinTransactionsWithFakeSignatures");
        }
    }

    /**
     * Creates transaction and broadcasts it to the network. Saves its description if present on successful broadcasting.
     * Supports sending for ETH and ERC20 tokens
     *
     * @param coin {Coin} coin to send transaction in
     * @param mnemonic {string} mnemonic words of this wallet
     * @param passphrase {string} passphrase string of this wallet
     * @param txData {TxData} data to create transaction
     * @return {Promise<string|{ errorDescription: string, howToFix: string }>} resolving to transaction id of transaction
     *         appeared in the blockchain or to a determined error object
     */
    static async createEthTransactionAndBroadcast(coin, mnemonic, passphrase, txData) {
        const loggerSource = "createEthTransactionAndBroadcast";
        try {
            const network = Storage.getCurrentNetwork(coin);
            const { privateKey } = KeysBip44.generateKeysForAccountAddressByWalletCredentials(
                mnemonic,
                passphrase,
                network
            );

            const wallet = new ethers.Wallet(privateKey);
            const myAddress = EthAddressesService.getCurrentEthAddress();
            const txsCount = await EthereumTransactionsCountProvider.getEthereumTransactionsCount(myAddress);
            const maxFeeSafetyFraction = 0.1; // 10% to cover possible fee fluctuation as it is pretty dynamic
            Logger.log(`Building eth transaction based on tx data: ${safeStringify(txData)}`, loggerSource);
            const maxFeePerGasWei = BigNumber(txData.feeRate.baseFeePerGasInWei)
                .plus(txData.feeRate.maxPriorityFeePerGasWei)
                .times(1 + maxFeeSafetyFraction)
                .toFixed(0);
            /**
             * Ethereum EIP-1559 transaction object.
             * This transaction uses the EIP-1559 fee mechanism where fees are split into:
             * - maxFeePerGas: The maximum fee you're willing to pay per unit of gas. This value serves
             *   as an upper cap covering both the dynamic base fee (network-determined) and the tip.
             * - maxPriorityFeePerGas: The tip (or priority fee) offered to miners to incentivize timely inclusion.
             *
             * The gasLimit defines the maximum amount of computational work (gas units) the transaction is allowed
             * to use during execution, protecting you from unexpected high consumption. Additional fields include:
             * - from: Sender's Ethereum address.
             * - to: Recipient's address (using a token address if the transaction is for a token transfer).
             * - value: The transaction value in wei (non-zero only if transferring ETH).
             * - nonce: The transaction count for the sender, ensuring transaction ordering.
             * - chainId: The identifier of the network the transaction is sent on.
             */
            const tx = {
                type: 0x02, // EIP-1559 - transactions supporting new fee calculation
                from: myAddress,
                to: coin === Coins.COINS.ETH ? txData.address : coin.tokenAddress,
                value: coin === Coins.COINS.ETH ? ethers.BigNumber.from(txData.amount) : ethers.BigNumber.from("0"),
                maxFeePerGas: ethers.BigNumber.from(maxFeePerGasWei),
                maxPriorityFeePerGas: txData.feeRate.maxPriorityFeePerGasWei,
                gasLimit: txData.feeRate.gasLimit,
                nonce: txsCount,
                chainId: ethers.providers.getNetwork(network.key).chainId,
            };
            if (coin !== Coins.COINS.ETH) {
                tx.data = Erc20transactionUtils.composeEthereumTransactionDataForGivenParams(
                    txData.address,
                    txData.amount
                );
            }

            Logger.log(`Sending ethereum tx: ${JSON.stringify(tx)}`, loggerSource);

            let sentTxId;
            let rawSignedTx = await wallet.signTransaction(tx);
            try {
                sentTxId = await EthereumPushTransactionProvider.pushRawEthereumTransaction(rawSignedTx);
            } catch (e) {
                Logger.log(`Failed to send ethereum tx. Error is: ${safeStringify(e)}`, loggerSource);
                const determinedError = tryToGetDeterminedErrorFromEtherSendError(e);
                if (determinedError) return determinedError;

                throw e;
            }

            if (!sentTxId) {
                throw new Error(`Sent ethereum tx has null hash: ${sentTxId}`);
            }

            Logger.log(`Successfully sent a ethereum transaction: ${sentTxId}`, loggerSource);
            return sentTxId;
        } catch (e) {
            Logger.log(`Failed to send ethereum transaction: ${safeStringify(e)}`, loggerSource);
            improveAndRethrow(e, loggerSource);
        }
    }
}

/**
 * @param coin {Coin}
 * @param coinAmount {string}
 * @param isSendAll {boolean}
 * @param feeAtoms {string}
 * @param balanceOfSendingCoinAtoms {string}
 * @param balanceOfFeeCoinAtoms {string}
 * @return {string}
 */
const chooseAmount = function (
    coin,
    coinAmount,
    isSendAll,
    feeAtoms,
    balanceOfSendingCoinAtoms,
    balanceOfFeeCoinAtoms
) {
    if (!isSendAll) {
        return coin.coinAmountToAtoms(coinAmount);
    }

    if (coin.doesUseDifferentCoinFee()) {
        // sending all token balance case
        return balanceOfSendingCoinAtoms;
    }
    const etherBalance = BigNumber(balanceOfFeeCoinAtoms ?? balanceOfSendingCoinAtoms);
    if (etherBalance.gte(feeAtoms)) {
        // sending all ether balance case
        return AmountUtils.toIntegerString(etherBalance.minus(feeAtoms));
    }
    return "0";
};

/**
 * @param network {Network}
 * @param gasLimit {string}
 * @param coinsAmount {string}
 * @param isSendAll {boolean}
 * @param sendBalanceAtoms {string}
 * @param feeBalanceAtoms {string}
 * @param address {string}
 * @param coin {Coin}
 * @return {Promise<{result: {result: boolean, txsDataArray: TxData[]}, isAtLeastOneOptionCoverable: boolean}>}
 */
async function optsForOneRate(
    network,
    gasLimit,
    coinsAmount,
    isSendAll,
    sendBalanceAtoms,
    feeBalanceAtoms,
    address,
    coin
) {
    // Fallback logic to return 4 identical fee options calculated by single option Alchemy data if major rates retrieval fails
    const { maxFeePerGas, maxPriorityFeePerGas } = await EthereumBlockchainFeeDataProvider.getEthereumFeeData();
    const maxFeePerGasAtomsString = ethers.utils
        .parseUnits(AmountUtils.trim(BigNumber(maxFeePerGas), gweiDecimalPlaces), gweiDecimalPlaces)
        .toString();
    const maxPriorityFeePerGasAtomsString = ethers.utils
        .parseUnits(AmountUtils.trim(BigNumber(maxPriorityFeePerGas), gweiDecimalPlaces), gweiDecimalPlaces)
        .toString();
    const feeAtoms = AmountUtils.toIntegerString(BigNumber(maxFeePerGasAtomsString).times(gasLimit));
    const correctAtomsAmount = chooseAmount(coin, coinsAmount, isSendAll, feeAtoms, sendBalanceAtoms, feeBalanceAtoms);
    return {
        result: {
            result: true,
            txsDataArray: new Array(4).fill(
                new TxData(correctAtomsAmount, address, null, feeAtoms, null, null, network, {
                    rate: maxFeePerGasAtomsString,
                    maxPriorityFeePerGasWei: maxPriorityFeePerGasAtomsString,
                    gasLimit: gasLimit,
                    baseFeePerGasInWei: BigNumber(maxFeePerGasAtomsString)
                        .minus(maxPriorityFeePerGasAtomsString)
                        .toFixed(0),
                })
            ),
        },
        isAtLeastOneOptionCoverable: BigNumber(feeAtoms)
            .plus(coin.doesUseDifferentCoinFee() ? "0" : correctAtomsAmount)
            .lte(feeBalanceAtoms),
    };
}

/**
 * @param ratesGWei {number[]}
 * @param baseFeePerGasGwei {string}
 * @param gasLimit {string}
 * @param coinsAmount {string}
 * @param isSendAll {boolean}
 * @param sendBalanceAtoms {string}
 * @param feeBalanceAtoms {string}
 * @param coin {Coin}
 * @param address {string}
 * @param network {Network}
 * @return {{result: {result: boolean, txsDataArray: TxData[]}, isAtLeastOneOptionCoverable: boolean}}
 */
function optsForSeveralRates(
    ratesGWei,
    baseFeePerGasGwei,
    gasLimit,
    coinsAmount,
    isSendAll,
    sendBalanceAtoms,
    feeBalanceAtoms,
    coin,
    address,
    network
) {
    const feeData = ratesGWei.map(maxPriorityFeePerGasOptionGwei => {
        const fee = ethers.utils
            .parseUnits(
                AmountUtils.trim(BigNumber(baseFeePerGasGwei).plus(maxPriorityFeePerGasOptionGwei), gweiDecimalPlaces),
                "gwei"
            )
            .mul(gasLimit)
            .toString();
        Logger.log(
            `ETH fee option ${fee}, base gwei: ${baseFeePerGasGwei}, pr: ${maxPriorityFeePerGasOptionGwei}, lim: ${gasLimit}`,
            "optsForSeveralRates"
        );
        return {
            maxPriorityFeePerGasOptionGwei: maxPriorityFeePerGasOptionGwei,
            feeWeiString: fee,
            correctedAtomsAmount: chooseAmount(coin, coinsAmount, isSendAll, fee, sendBalanceAtoms, feeBalanceAtoms),
        };
    });
    const feeIsCoverableFlags = feeData.map(d => {
        return BigNumber(d.feeWeiString)
            .plus(coin.doesUseDifferentCoinFee() ? "0" : d.correctedAtomsAmount)
            .lte(feeBalanceAtoms);
    });
    const isAtLeastOneOptionCoverable = !!feeIsCoverableFlags.find(flag => flag);
    const result = {
        result: true,
        txsDataArray: feeData.map((d, index) => {
            if (isAtLeastOneOptionCoverable && !feeIsCoverableFlags[index]) {
                /**
                 * We return error object if at least one of remaining options is coverable. If all
                 * options cannot be covered we return them so the user can see fee estimation
                 */
                return {
                    errorDescription: "There is not enough ETH to send the amount with selected fee",
                    howToFix: "Either use smaller fee option or top up your ETH balance",
                };
            }

            const rateAtoms = ethers.utils
                .parseUnits(
                    AmountUtils.trim(
                        BigNumber(baseFeePerGasGwei ?? "0").plus(d.maxPriorityFeePerGasOptionGwei ?? "0"),
                        gweiDecimalPlaces
                    ),
                    gweiDecimalPlaces
                )
                .toString();
            return new TxData(d.correctedAtomsAmount, address, null, d.feeWeiString, null, null, network, {
                rate: rateAtoms,
                maxPriorityFeePerGasWei: ethers.utils
                    .parseUnits(
                        AmountUtils.trim(BigNumber(d.maxPriorityFeePerGasOptionGwei), gweiDecimalPlaces),
                        "gwei"
                    )
                    .toString(),
                gasLimit: gasLimit,
                baseFeePerGasInWei: ethers.utils
                    .parseUnits(AmountUtils.trim(BigNumber(baseFeePerGasGwei), gweiDecimalPlaces), "gwei")
                    .toString(),
            });
        }),
    };

    return { isAtLeastOneOptionCoverable: isAtLeastOneOptionCoverable, result: result };
}

export function tryToGetDeterminedErrorFromEtherSendError(e) {
    /**
     * We try to determine common errors here.
     * TODO: [feature, critical] Experiment and add other errors handling like nonce errors
     */
    if (/cannot estimate gas/.test(e.message)) {
        /**
         * This error has 32000 code - this code is for server-specific errors for ETH JSON RPC, not standard ones.
         * This is caused by eth_estimateGas internal call. During the development we noticed that this error
         * occurs when trying to estimate tx having not enough balance to send the transaction and cover the fee.
         * So we return the determined that the options should be recalculated.
         */
        return {
            errorDescription:
                "Looks like fee rate changes really fast and selected option no more relevant to send the transaction as it plus sending amount overlap the balance",
            howToFix: "Please go back to the send form and choose from the newly calculated options",
        };
    }

    return null;
}
