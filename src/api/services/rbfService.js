import bip39 from "bip39";

import { getAccountsData, getCurrentNetwork, getWalletId, isSatoshiModeEnabled } from "./internal/storage";
import { getCurrentFeeRate } from "./feeRatesService";
import { getDenomination, satoshiAmountToAnotherDenomination } from "../lib/transactions/transactions-utils";
import { btcToSatoshi, satoshiToBtc } from "../lib/btc-utils";
import { improveAndRethrow, logError } from "../utils/errorUtils";
import PaymentService from "./paymentService";
import { MIN_FEE_RATES } from "../lib/fees";
import AddressesService from "./addressesService";
import { getSortedListOfCandidateUtxosForRbf } from "../lib/utxos";
import { getAllUTXOs } from "./utils/utxosUtils";
import AddressesDataApi from "../external-apis/backend-api/addressesDataApi";
import AddressesServiceInternal from "./internal/addressesServiceInternal";
import UtxosService from "./internal/utxosService";
import { transactionsDataProvider } from "./internal/transactionsDataProvider";
import { TransactionsDataService } from "./transactionsDataService";
import { getDecryptedWalletCredentials } from "./internal/authServiceInternal";
import {
    calculateFeeForExistingTransactionForFeeRates,
    createTransactionWithChangedFee,
} from "../lib/transactions/rbf";
import { broadcastTransaction } from "./internal/transactionsBroadcastingService";
import { Logger } from "./internal/logs/logger";

export default class RbfService {
    static BLOCKS_COUNTS_FOR_RBF_OPTIONS = [1, 2, 5, 10];
    static STATIC_APPROX_CONFIRMATION_TIME = ["10 min", "20 min", "50 min", "1.5 h"];

    /**
     * Calculates fee options for RBF process for predefined set of blocks counts. Returned array is ordered according
     * to the blocks count array order.
     *
     * @param oldTxId - id of replacing transaction
     * @returns Promise resolving to array of objects of format:
     *          {
     *              rate: FeeRate instance,
     *              fee: number or null,
     *              fiatFee: number or null,
     *              isCoverableByBalance: boolean
     *              isRational: boolean
     *          }
     *          - isRational=false signals that this option has fee that in terms of current fee rates
     *            is greater than fee required for 1-block confirmation
     */
    // TODO: [tests, moderate] Implement tests checking the calculation logic (just behavior currently)
    static async getFeeOptionsForRbf(oldTxId) {
        const loggerSource = "getFeeOptionsForRbf";
        try {
            Logger.log(`Start getting fee options for txid: ${oldTxId}`, loggerSource);
            const network = getCurrentNetwork();
            const resolvedPromises = await Promise.all([
                ...this.BLOCKS_COUNTS_FOR_RBF_OPTIONS.map(blocksCount => getCurrentFeeRate(network, blocksCount)),
                transactionsDataProvider.getTransactionData(oldTxId),
                AddressesServiceInternal.getAllUsedAddresses(),
                AddressesService.getCurrentChangeAddress(),
                AddressesDataApi.getAddressesIndexes(getWalletId()),
            ]);
            const rates = resolvedPromises.slice(0, this.BLOCKS_COUNTS_FOR_RBF_OPTIONS.length);
            const [oldTransaction, allAddresses, changeAddress, indexes] = resolvedPromises.slice(
                resolvedPromises.length - 4
            );

            Logger.log(
                `Addresses: internal: ${allAddresses.internal.length}, external: ${allAddresses.external.length}`,
                loggerSource
            );

            const allUtxos = await getAllUTXOs(allAddresses.internal, allAddresses.external, network);

            Logger.log(`UTXOs: ${JSON.stringify(allUtxos.count)}`, loggerSource);

            const candidateUtxos = getSortedListOfCandidateUtxosForRbf(getAccountsData(), indexes, allUtxos, network);

            Logger.log(`Candidate UTXOs: ${JSON.stringify(candidateUtxos)}`, loggerSource);

            const ratesToFeeMapping = calculateFeeForExistingTransactionForFeeRates(
                oldTransaction,
                allAddresses,
                changeAddress,
                rates,
                candidateUtxos
            );
            await convertToBtcAmountAndAddFiatAmount(ratesToFeeMapping, oldTransaction.fee_satoshis);

            Logger.log(`Returning fees: ${oldTxId}. ${JSON.stringify(ratesToFeeMapping)}`, loggerSource);
            return ratesToFeeMapping;
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Validates fee to be used as fee in new transaction that will replace old one.
     *
     * New fee should at least cover fee of old transaction and minimal allowable fee for new transaction.
     * Also new fee should not exceed balance of wallet.
     *
     * @param oldTxId - id of transaction to validate RBF fee value for
     * @param inputtedFee - fee inputted by user
     * @returns Promise resolving to one of
     *         - { result: false, errorDescription: "string description", howToFix: "string how to fix" }
     *         - { result: true, fee: number }
     */
    static async validateFeeForRbf(oldTxId, inputtedFee) {
        const loggerSource = "validateFeeForRbf";
        try {
            Logger.log(`Validating fee: ${oldTxId}. Fee: ${inputtedFee}`, loggerSource);

            const currentNetwork = getCurrentNetwork();
            const [oldTx, allAddresses, changeAddress, indexes] = await Promise.all([
                transactionsDataProvider.getTransactionData(oldTxId),
                AddressesServiceInternal.getAllUsedAddresses(),
                AddressesService.getCurrentChangeAddress(),
                AddressesDataApi.getAddressesIndexes(getWalletId()),
            ]);
            const accountsData = getAccountsData();
            const minFeeRate = MIN_FEE_RATES.find(rate => rate.network === currentNetwork.key);
            const allUtxos = await getAllUTXOs(allAddresses.internal, allAddresses.external, currentNetwork);
            const candidateUtxos = getSortedListOfCandidateUtxosForRbf(accountsData, indexes, allUtxos, currentNetwork);
            const newCalculatedFeesItems = calculateFeeForExistingTransactionForFeeRates(
                oldTx,
                allAddresses,
                changeAddress,
                [minFeeRate],
                candidateUtxos
            );

            if (newCalculatedFeesItems.errorDescription) {
                Logger.log(`Failed to calculate fees: ${JSON.stringify(newCalculatedFeesItems)}`, loggerSource);

                return {
                    result: false,
                    errorDescription: newCalculatedFeesItems.errorDescription,
                    howToFix: newCalculatedFeesItems.howToFix,
                };
            }

            const minNewFee = newCalculatedFeesItems[0].fee;
            const result = await validateFinalNewFee(inputtedFee, minNewFee);

            Logger.log(`Result: ${JSON.stringify(result)}`, loggerSource);
            return result;
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Performs RBF for transaction with given id.
     *
     * @param oldTxId - id of transaction to be replaced
     * @param newFee - final fee for new transaction (replacing one), BTC
     * @param password - password to decrypt mnemonic
     * @param isFinalPrice - flag signalling whether to set sequence for transaction prohibiting further RBFing, default is false
     * @returns Promise resolving to object: { oldFee: amount BTC, newFee: amount BTC, newTransactionId: string }
     *          or error object { errorDescription: string, howtoFix: string, newTransactionId: string }
     */
    static async performReplaceByFeeByPassword(oldTxId, newFee, password, isFinalPrice = false) {
        const loggerSource = "performReplaceByFeeByPassword";
        try {
            Logger.log(
                `Start. Old txid: ${oldTxId}, new fee: ${newFee}, empty password: ${!!password}, final: ${isFinalPrice}`,
                loggerSource
            );

            const network = getCurrentNetwork();
            const { mnemonic, passphrase } = getDecryptedWalletCredentials(password);
            const seedHex = bip39.mnemonicToSeedHex(mnemonic, passphrase);
            const accountsData = getAccountsData();
            const [oldTx, changeAddress, allAddresses, indexes] = await Promise.all([
                transactionsDataProvider.getTransactionData(oldTxId),
                AddressesService.getCurrentChangeAddress(),
                AddressesServiceInternal.getAllUsedAddresses(),
                AddressesDataApi.getAddressesIndexes(getWalletId()),
            ]);

            Logger.log(
                `Data was retrieved. Addresses external: ${allAddresses.external.length}, internal: ${allAddresses.internal.length}`,
                loggerSource
            );

            const allUtxos = await getAllUTXOs(allAddresses.internal, allAddresses.external, network);
            Logger.log(`UTXOs were retrieved: ${JSON.stringify(allUtxos)}`, loggerSource);

            const candidateUtxos = getSortedListOfCandidateUtxosForRbf(accountsData, indexes, allUtxos, network);
            Logger.log(`Candidate UTXOS: ${JSON.stringify(candidateUtxos)}`, loggerSource);

            const txOrErrorObject = createTransactionWithChangedFee(
                oldTx,
                btcToSatoshi(newFee),
                seedHex,
                changeAddress,
                network,
                indexes,
                allAddresses,
                candidateUtxos,
                isFinalPrice
            );

            if (txOrErrorObject.errorDescription) {
                Logger.log(`Failed to create new transaction: ${JSON.stringify(txOrErrorObject)}`, loggerSource);
                return txOrErrorObject;
            }

            Logger.log("Transaction was created, pushing it", loggerSource);

            const newTransactionId = await broadcastTransaction(txOrErrorObject, network);

            Logger.log(`Transaction was pushed: ${newTransactionId}`, loggerSource);

            await saveNoteForNewTransaction(oldTxId, newTransactionId);

            const result = {
                oldFee: satoshiToBtc(oldTx.fee_satoshis),
                newFee,
                newTransactionId,
            };

            Logger.log(`Returning result: ${JSON.stringify(result)}`, loggerSource);
            return result;
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }
}

async function saveNoteForNewTransaction(oldTxId, newTxId) {
    try {
        const data = await TransactionsDataService.getTransactionsData([oldTxId]);
        if (data[0]?.note?.length > 0) {
            await TransactionsDataService.saveTransactionData(newTxId, { note: data[0].note });
        }
    } catch (e) {
        logError(e, "saveNoteForNewTransaction", "Failed to save old note for new transaction after RBF");
    }
}

async function convertToBtcAmountAndAddFiatAmount(ratesToFeeMapping) {
    const btcFees = ratesToFeeMapping.map(item => {
        if (item.fee == null) {
            return null;
        }

        return satoshiToBtc(item.fee);
    });

    const fiatFees = await PaymentService.convertBtcAmountsToFiat(btcFees);
    for (let i = 0; i < ratesToFeeMapping.length; ++i) {
        ratesToFeeMapping[i].fee = btcFees[i];
        ratesToFeeMapping[i].fiatFee = fiatFees[i];
    }
}

async function validateFinalNewFee(inputtedFee, minFeeSatoshis) {
    if (!inputtedFee && inputtedFee !== 0) {
        return {
            result: false,
            errorDescription: "A fee is required. ",
            howToFix: "Please enter a fee. ",
        };
    }

    const isSatoshiMode = isSatoshiModeEnabled();
    if (!isSatoshiMode) {
        inputtedFee = btcToSatoshi(inputtedFee);
    }

    const denomination = getDenomination(isSatoshiMode);
    if (inputtedFee < minFeeSatoshis) {
        const minFeeForDenomination = satoshiAmountToAnotherDenomination(minFeeSatoshis, denomination);
        return {
            result: false,
            errorDescription:
                "This amount should cover the fee of original transaction plus the fee " +
                `of the new transaction: ${minFeeForDenomination} ${denomination}.`,
            howToFix: "Enter a greater fee amount and try again. ",
        };
    }

    const balanceSatoshi = (await UtxosService.calculateBalance())?.spendable;
    if (inputtedFee > balanceSatoshi) {
        const balanceForDenomination = satoshiAmountToAnotherDenomination(balanceSatoshi, denomination);
        return {
            result: false,
            errorDescription: `The entered amount is greater than the balance you can spend: ${balanceForDenomination} ${denomination}. `,
            howToFix: "Enter a smaller fee amount and try again.",
        };
    }

    return {
        result: true,
        fee: inputtedFee,
    };
}
