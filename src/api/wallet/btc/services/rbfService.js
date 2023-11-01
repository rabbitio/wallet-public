import bip39 from "bip39";

import { getAccountsData, getCurrentNetwork, getWalletId } from "../../../common/services/internal/storage";
import { getCurrentFeeRate } from "./feeRatesService";
import { improveAndRethrow, logError } from "../../../common/utils/errorUtils";
import { DEFAULT_RATES, MIN_FEE_RATES } from "../lib/fees";
import AddressesService from "./addressesService";
import { getSortedListOfCandidateUtxosForRbf } from "../lib/utxos";
import { getAllUTXOs } from "./utils/utxosUtils";
import AddressesDataApi from "../../common/backend-api/addressesDataApi";
import AddressesServiceInternal from "./internal/addressesServiceInternal";
import UtxosService from "./internal/utxosService";
import { TransactionsDataService } from "../../common/services/transactionsDataService";
import {
    calculateFeeForExistingTransactionForFeeRates,
    createTransactionWithChangedFee,
} from "../lib/transactions/rbf";
import { broadcastTransaction } from "./internal/transactionsBroadcastingService";
import { Logger } from "../../../support/services/internal/logs/logger";
import { getDecryptedWalletCredentials } from "../../../auth/services/authService";
import CoinsToFiatRatesService from "../../common/services/coinsToFiatRatesService";
import { Coins } from "../../coins";
import { retrieveTransactionData } from "../external-apis/transactionDataAPI";
import { TxData } from "../../common/models/tx-data";
import { Wallets } from "../../common/wallets";
import { EventBus, INCREASE_FEE_IS_FINISHED_EVENT } from "../../../common/adapters/eventbus";

export default class RbfService {
    static BLOCKS_COUNTS_FOR_RBF_OPTIONS = [1, 2, 5, 10];

    /**
     * Calculates fee options for RBF process for predefined set of blocks counts. Returned array is ordered according
     * to the blocks count array order.
     *
     * @param oldTxId {string} id of replacing transaction
     * @returns {Promise<{
     *              rate: FeeRate,
     *              fee: number|null,
     *              fiatFee: number|null,
     *              isCoverableByBalance: boolean,
     *              isRational: boolean
     *          }[]>}
     *          isRational=false signals that this option has fee that in terms of current fee rates
     *          is greater than fee required for 1-block confirmation
     */
    // TODO: [tests, moderate] Implement tests checking the calculation logic (just behavior currently)
    static async getFeeOptionsForRbf(oldTxId) {
        const loggerSource = "getFeeOptionsForRbf";
        try {
            Logger.log(`Start getting fee options for txid: ${oldTxId}`, loggerSource);
            const network = getCurrentNetwork();
            const indexes = await AddressesDataApi.getAddressesIndexes(getWalletId());
            const resolvedPromises = await Promise.all([
                ...this.BLOCKS_COUNTS_FOR_RBF_OPTIONS.map(blocksCount => getCurrentFeeRate(network, blocksCount)),
                retrieveTransactionData(oldTxId, network),
                AddressesServiceInternal.getAllUsedAddresses(indexes),
                AddressesService.getCurrentChangeAddress(),
            ]);
            const rates = resolvedPromises.slice(0, this.BLOCKS_COUNTS_FOR_RBF_OPTIONS.length);
            let [oldTransaction, allAddresses, changeAddress] = resolvedPromises.slice(resolvedPromises.length - 3);
            if (oldTransaction == null) {
                /* When trying to change fee for recently created transaction the retrieveTransactionData
                 * can return null as the providers we use under the hood possibly still have no
                 * transaction (that we just sent) inside the mempool they use.
                 * So here we are retrying to retrieve the details as we cannot go further without them.
                 */
                oldTransaction = await retrieveTransactionData(oldTxId, network);
            }

            Logger.log(
                `Addresses internal: ${allAddresses?.internal?.length}, external: ${allAddresses?.external?.length}, replacing tx: ${oldTransaction?.txid}, change: ${changeAddress}`,
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
     * Also, new fee should not exceed balance of wallet.
     *
     * @param oldTxId {string} id of transaction to validate RBF fee value for
     * @param inputtedFeeBtc {string} fee inputted by user (BTC amount)
     * @returns {Promise<{ result: true, fee: number }|{ result: false, errorDescription: string, howToFix: string }>}
     */
    static async validateFeeForRbf(oldTxId, inputtedFeeBtc) {
        const loggerSource = "validateFeeForRbf";
        try {
            Logger.log(`Validating fee: ${oldTxId}. Fee: ${inputtedFeeBtc}`, loggerSource);

            const currentNetwork = getCurrentNetwork();
            const indexes = await AddressesDataApi.getAddressesIndexes(getWalletId());
            const [oldTx, allAddresses, changeAddress] = await Promise.all([
                retrieveTransactionData(oldTxId, currentNetwork),
                AddressesServiceInternal.getAllUsedAddresses(indexes),
                AddressesService.getCurrentChangeAddress(),
            ]);

            Logger.log(
                `Addresses internal: ${allAddresses?.internal?.length}, external: ${allAddresses?.external?.length}, replacing tx: ${oldTx?.txid}, change: ${changeAddress}`,
                loggerSource
            );

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
            const result = await validateFinalNewFee(inputtedFeeBtc, minNewFee);

            Logger.log(`Result: ${JSON.stringify(result)}`, loggerSource);
            return result;
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Performs RBF for transaction with given id.
     *
     * @param oldTxId {string} id of transaction to be replaced
     * @param newFee {string|number} final fee for new transaction (replacing one), BTC
     * @param password {string} password to decrypt mnemonic
     * @param [isFinalPrice=false] {boolean} flag signalling whether to set sequence for transaction prohibiting further RBFing, default is false
     * @returns {Promise<{ oldFee: number, newFee: string|number, newTransactionId: string }|{ errorDescription: string, howtoFix: string, newTransactionId: string }>}
     *          fee values are in BTC, not satoshi
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
            const indexes = await AddressesDataApi.getAddressesIndexes(getWalletId());
            const [oldTx, changeAddress, allAddresses] = await Promise.all([
                retrieveTransactionData(oldTxId, network),
                AddressesService.getCurrentChangeAddress(),
                AddressesServiceInternal.getAllUsedAddresses(indexes),
            ]);

            Logger.log(
                `Addresses internal: ${allAddresses?.internal?.length}, external: ${allAddresses?.external?.length}, replacing tx: ${oldTx?.txid}, change: ${changeAddress}`,
                loggerSource
            );

            const allUtxos = await getAllUTXOs(allAddresses.internal, allAddresses.external, network);
            Logger.log(`UTXOs were retrieved: ${JSON.stringify(allUtxos)}`, loggerSource);

            const candidateUtxos = getSortedListOfCandidateUtxosForRbf(accountsData, indexes, allUtxos, network);
            Logger.log(`Candidate UTXOS: ${JSON.stringify(candidateUtxos)}`, loggerSource);

            const newFeeSatoshi = +Coins.COINS.BTC.coinAmountToAtoms("" + newFee);
            const creationResult = createTransactionWithChangedFee(
                oldTx,
                newFeeSatoshi,
                seedHex,
                changeAddress,
                network,
                indexes,
                allAddresses,
                candidateUtxos,
                isFinalPrice
            );

            if (creationResult.errorDescription) {
                Logger.log(`Failed to create new transaction: ${JSON.stringify(creationResult)}`, loggerSource);
                return creationResult;
            }

            Logger.log("Transaction was created, pushing it", loggerSource);

            const newTransactionId = await broadcastTransaction(creationResult.bitcoinJsTx, network);

            Logger.log(`Transaction was pushed: ${newTransactionId}`, loggerSource);

            EventBus.dispatch(INCREASE_FEE_IS_FINISHED_EVENT);

            await saveNoteForNewTransactionWithoutFailing(oldTxId, newTransactionId);

            actualizeTransactionsCacheWithoutFailing(
                creationResult.params,
                oldTx.fee_satoshis,
                newFeeSatoshi,
                network,
                newTransactionId,
                oldTxId
            );

            const result = {
                oldFee: +Coins.COINS.BTC.atomsToCoinAmount("" + oldTx.fee_satoshis),
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

async function saveNoteForNewTransactionWithoutFailing(oldTxId, newTxId) {
    try {
        const data = await TransactionsDataService.getTransactionsData([oldTxId]);
        if (data[0]?.note?.length > 0) {
            await TransactionsDataService.saveTransactionData(newTxId, { note: data[0].note });
        }
    } catch (e) {
        logError(e, "saveNoteForNewTransactionWithoutFailing", "Failed to save old note for new transaction after RBF");
    }
}

function actualizeTransactionsCacheWithoutFailing(params, oldFee, newFee, network, newTransactionId) {
    const loggerSource = "actualizeTransactionsCacheWithoutFailing";
    try {
        const anyStubRate = DEFAULT_RATES[0];
        const txData = new TxData(
            params.amount,
            params.targetAddress,
            params.newChange,
            newFee,
            params.currentChangeAddress,
            params.utxos,
            network,
            { rate: anyStubRate }
        );

        const btcWallet = Wallets.getWalletByCoin(Coins.COINS.BTC);
        btcWallet.actualizeLocalCachesWithNewTransactionData(Coins.COINS.BTC, txData, newTransactionId);
        btcWallet.actualizeBalanceCacheWithAmountAtoms("" + (newFee - oldFee), -1);
    } catch (e) {
        logError(e, loggerSource, `Failed to actualize cache for rbf new tx ${newTransactionId}`);
    }
}

async function convertToBtcAmountAndAddFiatAmount(ratesToFeeMapping) {
    const btcFees = ratesToFeeMapping.map(item => {
        if (item.fee == null) {
            return null;
        }

        return +Coins.COINS.BTC.atomsToCoinAmount("" + item.fee);
    });

    const fiatFees = await CoinsToFiatRatesService.convertCoinAmountsToFiat(Coins.COINS.BTC, btcFees);
    for (let i = 0; i < ratesToFeeMapping.length; ++i) {
        ratesToFeeMapping[i].fee = btcFees[i];
        ratesToFeeMapping[i].fiatFee = fiatFees[i];
    }
}

async function validateFinalNewFee(inputtedFeeBtc, minFeeSatoshis) {
    try {
        if (!inputtedFeeBtc && inputtedFeeBtc !== 0) {
            return {
                result: false,
                errorDescription: "A fee is required. ",
                howToFix: "Please enter a fee. ",
            };
        }

        const minFeeBtc = +Coins.COINS.BTC.atomsToCoinAmount("" + minFeeSatoshis);
        if (+inputtedFeeBtc < minFeeBtc) {
            return {
                result: false,
                errorDescription:
                    "This amount should cover the fee of original transaction plus the fee " +
                    `of the new transaction: ${minFeeBtc} BTC.`,
                howToFix: "Enter a greater fee amount and try again. ",
            };
        }

        const balanceSatoshi = (await UtxosService.calculateBalance())?.spendable;
        if (balanceSatoshi == null || typeof balanceSatoshi !== "number")
            throw new Error("Failed to calculate balance for rbf amount validation");
        const balanceBtc = +Coins.COINS.BTC.atomsToCoinAmount("" + balanceSatoshi);
        if (inputtedFeeBtc > balanceBtc) {
            return {
                result: false,
                errorDescription: `The entered amount is greater than the balance you can spend: ${balanceBtc} BTC. `,
                howToFix: "Enter a smaller fee amount and try again.",
            };
        }

        return {
            result: true,
            fee: inputtedFeeBtc,
        };
    } catch (e) {
        improveAndRethrow(e, "validateFinalNewFee");
    }
}
