import { improveAndRethrow } from "@rabbitio/ui-kit";

import { Utxo } from "../../models/transaction/utxo.js";
import { getAddresses, Utxos } from "../utxos.js";
import { EcPairsUtils } from "../addresses.js";
import { BtcTransactionBuilder, FORBID_RBF_SEQUENCE, MAX_RBF_SEQUENCE } from "./build-transaction.js";
import { BtcFeeCalculatorByFeeRate } from "../fees.js";
import { getFeePlusSendingAmountOverlapsBalanceErrorData, getNetworkByTransaction } from "./transactions-utils.js";
import { Coins } from "../../../coins.js";

export class BtcRbfUtils {
    /**
     * Creates new transaction on base of old one but with new fee according to RBF protocol.
     *
     * @param oldTransaction {Transaction} old transaction data
     * @param newFee {number} new fee for replacing transaction (not less than fee of old tx + fee covering new tx for some used rate)
     * @param seedHex {string} seed of HD wallet to calculate signatures for signing process
     * @param changeAddress {string} change address
     * @param network {Network} network to work in
     * @param indexes {Object} indexes of addresses of the wallet
     * @param allAddresses {{internal: string[], external: string[]}} all used/current addresses of wallet
     * @param candidateUtxos {Utxo[]} list of currently available utxos (sorted by amount descending)
     * @param isFinalPrice {boolean} flag signalling whether to set sequence for transaction prohibiting further RBFing
     * @returns {
     *              {
     *                  bitcoinJsTx: Object,
     *                  params: {
     *                      amount: number,
     *                      targetAddress: string,
     *                      newChange: number,
     *                      currentChangeAddress: string,
     *                      utxos: Utxo[],
     *                  }
     *              }
     *              |
     *              {
     *                  errorDescription: string,
     *                  howToFix: string
     *              }
     *          }
     */
    static createTransactionWithChangedFee(
        oldTransaction,
        newFee,
        seedHex,
        changeAddress,
        network,
        indexes,
        allAddresses,
        candidateUtxos,
        isFinalPrice
    ) {
        try {
            if (oldTransaction.confirmations !== 0) {
                return {
                    errorDescription: "We’ve got you covered. The original transaction has already been confirmed. ",
                    howToFix: "Fees can only be changed for unconfirmed transactions. ",
                };
            }

            const changeOutput = this._getChangeOutputFromTransaction(oldTransaction, allAddresses.internal);
            const sendingOutput = this._getSendingOutputFromTransaction(oldTransaction, allAddresses.internal);
            let utxos = this._composeUsedUtxosFromTransaction(oldTransaction);

            let newChange = changeOutput.value_satoshis + oldTransaction.fee_satoshis - newFee;
            if (newChange < 0) {
                const amountToBeCovered = -newChange;
                // TODO: [bug, low] newFee is calculated for some set of utxos but here we can operate with another
                //       set of utxos (e.g. new tx can come while user not calling this method or user can send another tx
                //       using some of utxos considered as available previously). And (as newFee can be calculated for
                //       tx without change it can be not so corresponding to
                const additionalUtxosRetrievalResult = this._selectAdditionalUtxosForRbf(
                    candidateUtxos,
                    amountToBeCovered
                );

                if (additionalUtxosRetrievalResult.errorDescription) {
                    return additionalUtxosRetrievalResult;
                }

                utxos = utxos.concat(additionalUtxosRetrievalResult);
                const amountOfSelectedAdditionalUtxos = additionalUtxosRetrievalResult.reduce(
                    (sum, utxo) => sum + utxo.value_satoshis,
                    0
                );
                newChange = amountOfSelectedAdditionalUtxos - amountToBeCovered;
            }

            const amount = sendingOutput.value_satoshis;
            const targetAddress = sendingOutput.addresses[0];
            const currentChangeAddress = changeOutput.addresses[0] || changeAddress;
            const ecPairsMapping = EcPairsUtils.getEcPairsToAddressesMapping(
                getAddresses(utxos),
                seedHex,
                network,
                indexes
            );

            const sequence = (isFinalPrice && FORBID_RBF_SEQUENCE) || MAX_RBF_SEQUENCE;
            const bitcoinJsTxOrError = BtcTransactionBuilder.buildTransaction(
                amount,
                targetAddress,
                newChange,
                currentChangeAddress,
                utxos,
                ecPairsMapping,
                network,
                sequence
            );
            if (bitcoinJsTxOrError.errorDescription) {
                return bitcoinJsTxOrError;
            }

            return {
                bitcoinJsTx: bitcoinJsTxOrError,
                params: {
                    amount: amount,
                    targetAddress: targetAddress,
                    newChange: newChange,
                    currentChangeAddress: currentChangeAddress,
                    utxos: utxos,
                },
            };
        } catch (e) {
            improveAndRethrow(e, "createTransactionWithChangedFee");
        }
    }

    static _getChangeOutputFromTransaction(tx, internalAddresses) {
        if (tx.outputs.length < 1 || tx.outputs.length > 2) {
            throw new Error(
                "Cannot get change output: unsupported number of outputs in transaction. Only 1 or 2 outputs cases are supported. "
            );
        }

        const matchedOutputs = tx.outputs.filter(output => internalAddresses.includes(output.addresses[0]));
        if (matchedOutputs.length > 1) {
            throw new Error(`Wrong number of change outputs: ${matchedOutputs.length}. `);
        }

        return matchedOutputs[0] || { value_satoshis: 0, addresses: [] };
    }

    static _getSendingOutputFromTransaction(tx, internalAddresses) {
        if (tx.outputs.length < 1 || tx.outputs.length > 2) {
            throw new Error(
                "Cannot get sending output: unsupported number of outputs in transaction. Only 1 or 2 outputs cases are supported. "
            );
        }

        const matchedOutputs = tx.outputs.filter(output => !internalAddresses.includes(output.addresses[0]));
        if (matchedOutputs.length === 0 || matchedOutputs.length > 1) {
            throw new Error(`Wrong number of sending outputs: ${matchedOutputs.length}. `);
        }

        return matchedOutputs[0];
    }

    static _composeUsedUtxosFromTransaction(tx) {
        return tx.inputs.map(input => {
            return new Utxo(
                input.txid,
                input.output_number,
                input.value_satoshis,
                Coins.COINS.BTC.minConfirmations + 1,
                input.type,
                input.address
            );
        });
    }

    static _selectAdditionalUtxosForRbf(candidateUtxos, amountToBeCovered) {
        let additionalUtxos = [];
        let additionalSum = 0;
        let additionalUtxoIndex = 0;

        while (additionalSum - amountToBeCovered < 0 && additionalUtxoIndex < candidateUtxos.length) {
            additionalUtxos.push(candidateUtxos[additionalUtxoIndex]);
            additionalSum += additionalUtxos[additionalUtxoIndex].value_satoshis;
            ++additionalUtxoIndex;
        }

        if (additionalSum - amountToBeCovered < 0) {
            return getFeePlusSendingAmountOverlapsBalanceErrorData();
        }

        return additionalUtxos;
    }

    /**
     * Calculates fees for existing transaction but for specified fee rates.
     *
     * It is useful for RBF process to estimate min value for fee of replacing transaction for different fee rates causing
     * different time of confirmation.
     *
     * There is a probability that new fee will be greater than (old fee + old change). So we are processing it by
     * adding new UTXOs until the difference will be covered. But for some cases addition of all available UTXOs can still
     * not be enough so we return null as fee and set isCoverableByBalance flag to false.
     *
     * During fee calculation we are building two transactions (each time the set of UTXO used by transaction changes) - one
     * without change output and one with change output. It is because we cannot calculate fee before building a transaction -
     * we build it first, calculate fee and only then we are able to check final change amount.
     *
     * @param oldTransaction {Transaction} transaction to recalculate fee for
     * @param allAddresses {{internal: string[], external: string[]}} all used/current addresses of the wallet
     * @param currentChangeAddress {string} current change address
     * @param feeRates {FeeRate[]} array of FeeRate to calculate fee for
     * @param candidateUtxos {Utxo[]} sorted list of utxos that can be used for new transactions
     * @returns {{ rate: FeeRate, fee: number|null, isCoverableByBalance: boolean, isRational: boolean|null }[]}
     *          Array length is equal to length of feeRates array
     */
    static calculateFeeForExistingTransactionForFeeRates(
        oldTransaction,
        allAddresses,
        currentChangeAddress,
        feeRates,
        candidateUtxos
    ) {
        try {
            if (!feeRates.length) {
                return [];
            }

            const network = getNetworkByTransaction(oldTransaction);
            const changeOutput = this._getChangeOutputFromTransaction(oldTransaction, allAddresses.internal);
            const sendingOutput = this._getSendingOutputFromTransaction(oldTransaction, allAddresses.internal);
            const utxos = this._composeUsedUtxosFromTransaction(oldTransaction);
            const targetAddress = sendingOutput.addresses[0];
            const oldChangeAmount = changeOutput.value_satoshis;
            const oldFee = oldTransaction.fee_satoshis;
            const changeAddress = changeOutput.addresses[0] || currentChangeAddress;
            const ecPairsMapping = EcPairsUtils.getMappingOfAddressesToRandomEcPair(getAddresses(utxos), network);
            const finalMappingRatesToFee = [];
            let sourceSumForNewFee = oldTransaction.fee_satoshis + oldChangeAmount;
            const dustAmount = Utxos.getDustThreshold(targetAddress);
            let needToAddUtxos = false; // For first iteration we try with only utxos of original transaction
            do {
                if (needToAddUtxos) {
                    utxos.push(candidateUtxos[0]);
                    ecPairsMapping.push(
                        EcPairsUtils.getMappingOfAddressesToRandomEcPair(getAddresses([candidateUtxos[0]]), network)[0]
                    );
                    sourceSumForNewFee += candidateUtxos[0].value_satoshis;
                    candidateUtxos = candidateUtxos.slice(1);
                }
                needToAddUtxos = true; // If there are next iteration then we are adding candidate UTXOs so setting this flag
                /**
                 * Trying to get fee for one of not yet processed rates. Processing both cases with/without change output.
                 * (We cannot understand whether to use change output before the fee calculation)
                 */
                const sumOfUtxos = utxos.reduce((previous, current) => previous + current.value_satoshis, 0); // We use this instead of amount to ensure change output presence/absence
                const txNoChange = BtcTransactionBuilder.buildTransaction(
                    sumOfUtxos,
                    targetAddress,
                    0,
                    changeAddress,
                    utxos,
                    ecPairsMapping,
                    network
                );
                const txWithChange = BtcTransactionBuilder.buildTransaction(
                    sumOfUtxos - dustAmount - 1,
                    targetAddress,
                    dustAmount + 1,
                    changeAddress,
                    utxos,
                    ecPairsMapping,
                    network
                );

                for (let i = 0; i < feeRates.length; ++i) {
                    const rate = feeRates[i];
                    const feeOfTxNoChange = BtcFeeCalculatorByFeeRate.calculateFeeByFeeRate(txNoChange, rate);
                    const newRbfFeeForTxWithoutChange = feeOfTxNoChange + oldFee;
                    /* Ideally we want to have no change output but only here we can check actual change due to calculated fee.
                     * We also take into account oldFee as RBF requires to add it to fee of new transaction. */
                    const changeOfTxNoChange = sourceSumForNewFee - newRbfFeeForTxWithoutChange;
                    const feeOfTxHavingChange = BtcFeeCalculatorByFeeRate.calculateFeeByFeeRate(txWithChange, rate);
                    const newRbfFeeForTxHavingChange = feeOfTxHavingChange + oldFee;
                    const changeOfTxHavingChange = sourceSumForNewFee - newRbfFeeForTxHavingChange;

                    /** There are 4 possible meaningful cases:
                     *  1. changeOfTxNoChange < 0 -> means we should add more utxos
                     *  2. changeOfTxNoChange >=0 but is dust -> push feeOfTxNoChange to final map with coverable=true
                     *  3. changeOfTxNoChange > dust and feeOfTxHavingChange < 0 -> means we should add more utxos
                     *  4. changeOfTxNoChange > dust and feeOfTxHavingChange >= 0 -> push feeOfTxHavingChange to final map with coverable=true
                     */
                    if (changeOfTxNoChange >= 0 && changeOfTxNoChange <= dustAmount) {
                        finalMappingRatesToFee.push({
                            rate,
                            fee: newRbfFeeForTxWithoutChange,
                            isCoverableByBalance: true,
                        });
                    } else if (changeOfTxNoChange > dustAmount && changeOfTxHavingChange >= 0) {
                        finalMappingRatesToFee.push({
                            rate,
                            fee: newRbfFeeForTxHavingChange,
                            isCoverableByBalance: true,
                        });
                    }
                }
                feeRates = feeRates.filter(rate => !finalMappingRatesToFee.find(item => item.rate === rate));
            } while (feeRates.length && candidateUtxos.length);

            /* There are possible rare cases when the option having higher fee rate (means faster inclusion in block)
             * has smaller fee. This can occur due to adding/not adding change output or due to different set of used UTXOs.
             * For suc options we set the isRational flag to false.
             */
            finalMappingRatesToFee.forEach(item => {
                const thereIsNoOptionHavingSmallerFeeAndHigherRate = !finalMappingRatesToFee.find(
                    betterCandidate => betterCandidate.fee < item.fee && betterCandidate.rate.rate > item.rate.rate
                );
                item.isRational = thereIsNoOptionHavingSmallerFeeAndHigherRate;
            });

            /* Here we add data for fee rates that we were unsuccessful to cover using the available UTXOs set */
            feeRates.forEach(rate =>
                finalMappingRatesToFee.push({ rate, fee: null, isCoverableByBalance: false, isRational: null })
            );

            return finalMappingRatesToFee;
        } catch (e) {
            improveAndRethrow(e, "calculateFeeForExistingTransactionForFeeRates");
        }
    }
}
