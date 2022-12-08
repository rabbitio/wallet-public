import { Utxo } from "../../models/transaction/utxo";
import { getAddresses, getDustThreshold } from "../utxos";
import { getEcPairsToAddressesMapping, getMappingOfAddressesToRandomEcPair } from "../addresses";
import { buildTransaction, FORBID_RBF_SEQUENCE, MAX_RBF_SEQUENCE } from "./build-transaction";
import { improveAndRethrow } from "../../../../common/utils/errorUtils";
import { calculateFeeByFeeRate } from "../fees";
import { getFeePlusSendingAmountOverlapsBalanceErrorData, getNetworkByTransaction } from "./transactions-utils";
import { Coins } from "../../../coins";

/**
 * Creates new transaction on base of old one but with new fee according to RBF protocol.
 *
 * @param oldTransaction - old transaction data
 * @param newFee - new fee for replacing transaction (not less than fee of old tx + fee covering new tx for some used rate)
 * @param seedHex - seed of HD wallet to calculate signatures for signing process
 * @param changeAddress - change address
 * @param network - network to work in
 * @param indexes - indexes of addresses of the wallet
 * @param allAddresses - all used/current addresses of wallet
 * @param candidateUtxos - list of currently available utxos (sorted by amount descending)
 * @param isFinalPrice - flag signalling whether to set sequence for transaction prohibiting further RBFing

 * @returns Object - bitcoinjs transaction or error Object { errorDescription: string, howToFix: string }
 */
export function createTransactionWithChangedFee(
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

        const changeOutput = getChangeOutputFromTransaction(oldTransaction, allAddresses.internal);
        const sendingOutput = getSendingOutputFromTransaction(oldTransaction, allAddresses.internal);
        let utxos = composeUsedUtxosFromTransaction(oldTransaction);

        let newChange = changeOutput.value_satoshis + oldTransaction.fee_satoshis - newFee;
        if (newChange < 0) {
            const amountToBeCovered = -newChange;
            // TODO: [bug, low] newFee is calculated for some set of utxos but here we can operate with another
            //       set of utxos (e.g. new tx can come while user not calling this method or user can send another tx
            //       using some of utxos considered as available previously). And (as newFee can be calculated for
            //       tx without change it can be not so corresponding to
            const additionalUtxosRetrievalResult = selectAdditionalUtxosForRbf(candidateUtxos, amountToBeCovered);

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
        const ecPairsMapping = getEcPairsToAddressesMapping(getAddresses(utxos), seedHex, network, indexes);

        const sequence = (isFinalPrice && FORBID_RBF_SEQUENCE) || MAX_RBF_SEQUENCE;
        return buildTransaction(
            amount,
            targetAddress,
            newChange,
            currentChangeAddress,
            utxos,
            ecPairsMapping,
            network,
            sequence
        );
    } catch (e) {
        improveAndRethrow(e, "createTransactionWithChangedFee");
    }
}

function getChangeOutputFromTransaction(tx, internalAddresses) {
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

function getSendingOutputFromTransaction(tx, internalAddresses) {
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

function composeUsedUtxosFromTransaction(tx) {
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

function selectAdditionalUtxosForRbf(candidateUtxos, amountToBeCovered) {
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
 * @param oldTransaction - transaction to recalculate fee for
 * @param allAddresses - all used/current addresses of the wallet
 * @param currentChangeAddress - current change address
 * @param feeRates - array of FeeRate to calculate fee for
 * @param candidateUtxos - sorted list of utxos that can be used for new transactions
 * @returns Array (length is equal to length of feeRates array) of objects if following format:
 *          { rate: FeeRate obj, fee: number of satoshi|null, isCoverableByBalance: boolean, isRational: boolean }
 */
export function calculateFeeForExistingTransactionForFeeRates(
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
        const changeOutput = getChangeOutputFromTransaction(oldTransaction, allAddresses.internal);
        const sendingOutput = getSendingOutputFromTransaction(oldTransaction, allAddresses.internal);
        const utxos = composeUsedUtxosFromTransaction(oldTransaction);
        const targetAddress = sendingOutput.addresses[0];
        const oldChangeAmount = changeOutput.value_satoshis;
        const oldFee = oldTransaction.fee_satoshis;
        const changeAddress = changeOutput.addresses[0] || currentChangeAddress;
        const ecPairsMapping = getMappingOfAddressesToRandomEcPair(getAddresses(utxos), network);
        const finalMappingRatesToFee = [];
        let sourceSumForNewFee = oldTransaction.fee_satoshis + oldChangeAmount;
        const dustAmount = getDustThreshold(targetAddress);
        let needToAddUtxos = false; // For first iteration we try with only utxos of original transaction
        do {
            if (needToAddUtxos) {
                utxos.push(candidateUtxos[0]);
                ecPairsMapping.push(getMappingOfAddressesToRandomEcPair(getAddresses([candidateUtxos[0]]), network)[0]);
                sourceSumForNewFee += candidateUtxos[0].value_satoshis;
                candidateUtxos = candidateUtxos.slice(1);
            }
            needToAddUtxos = true; // If there are next iteration then we are adding candidate UTXOs so setting this flag
            /**
             * Trying to get fee for one of not yet processed rates. Processing both cases with/without change output.
             * (We cannot understand whether to use change output before the fee calculation)
             */
            const sumOfUtxos = utxos.reduce((previous, current) => previous + current.value_satoshis, 0); // We use this instead of amount to ensure change output presence/absence
            const txNoChange = buildTransaction(
                sumOfUtxos,
                targetAddress,
                0,
                changeAddress,
                utxos,
                ecPairsMapping,
                network
            );
            const txWithChange = buildTransaction(
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
                const feeOfTxNoChange = calculateFeeByFeeRate(txNoChange, rate);
                /* Ideally we want to have no change output but only here we can check actual change due to calculated fee.
                 * We also take into account oldFee as RBF requires to add it to fee of new transaction. */
                const changeOfTxNoChange = sourceSumForNewFee - feeOfTxNoChange - oldFee;
                const feeOfTxWithChange = calculateFeeByFeeRate(txWithChange, rate);
                const changeOfTxWithChange = sourceSumForNewFee - feeOfTxWithChange - oldFee;

                /** There are 4 possible meaningful cases:
                 *  1. changeOfTxNoChange < 0 -> means we should add more utxos
                 *  2. changeOfTxNoChange >=0 but is dust -> push feeOfTxNoChange to final map with coverable=true
                 *  3. changeOfTxNoChange > dust and feeOfTxWithChange < 0 -> means we should add more utxos
                 *  4. changeOfTxNoChange > dust and feeOfTxWithChange >= 0 -> push feeOfTxWithChange to final map with coverable=true
                 */
                if (changeOfTxNoChange >= 0 && changeOfTxNoChange <= dustAmount) {
                    finalMappingRatesToFee.push({ rate, fee: feeOfTxNoChange + oldFee, isCoverableByBalance: true });
                } else if (changeOfTxNoChange > dustAmount && changeOfTxWithChange >= 0) {
                    finalMappingRatesToFee.push({ rate, fee: feeOfTxWithChange + oldFee, isCoverableByBalance: true });
                }
            }
            feeRates = feeRates.filter(rate => !finalMappingRatesToFee.find(item => item.rate === rate));
        } while (feeRates.length && candidateUtxos.length);

        const itemWithGreatestPureTxFee = finalMappingRatesToFee.reduce(
            (prev, item) => (prev == null || item.fee - oldFee > prev.fee - oldFee ? item : prev),
            null
        );
        const greatestPureTxFee = itemWithGreatestPureTxFee != null ? itemWithGreatestPureTxFee.fee - oldFee : null;
        finalMappingRatesToFee.forEach(item => {
            item.isRational =
                greatestPureTxFee != null ? item.fee < greatestPureTxFee || item === itemWithGreatestPureTxFee : null;
        });

        feeRates.forEach(rate =>
            finalMappingRatesToFee.push({ rate, fee: null, isCoverableByBalance: false, isRational: null })
        );

        return finalMappingRatesToFee;
    } catch (e) {
        improveAndRethrow(e, "calculateFeeForExistingTransactionForFeeRates");
    }
}
