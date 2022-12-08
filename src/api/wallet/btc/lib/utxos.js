import is from "is_js";
import { BigNumber } from "ethers";

import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { isAddressValid, isBip49Addresses, isP2shAddress, isSegWitAddress } from "./addresses";
import { getNotDustUTXOsInTermsOfSpecificFeeRateConsideringSendingP2WPKH } from "./transactions/transactions-utils";
import { Coins } from "../../coins";

/**
 * Script types for internal use
 */
export const P2WPKH_SCRIPT_TYPE = "witness_v0_keyhash";
export const P2PKH_SCRIPT_TYPE = "pubkeyhash";
export const P2SH_SCRIPT_TYPE = "scripthash";

/**
 * Thresholds used to control operating utxos.
 * These thresholds are taken from bitcoin/scr/policy/policy.cpp:GetDustThreshold.
 * P2SH-P2WPKH to be precise should have other than 546 satoshi threshold but according to implementation (there is
 * a check in GetDustThreshold calling IsWitnessProgram) of bitcoin it is considered just as non-segwit so 546 is used.
 */
export const NON_SEGWIT_DUST_THRESHOLD = 546;
export const SEGWIT_DUST_THRESHOLD = 294;

/**
 * Filters array of all utxos to ones that can be used in transactions to send coins.
 *
 * Returns only utxos corresponding to used addresses of given accountsData in given network.
 * Ignores:
 *   - utxos with less than Coins.COINS.BTC.minConfirmations number of confirmations (if address of utxo is external)
 *   - not signable utxos (see docs for getSignableUtxos function)
 *   - dust utxos
 *
 * @param accountsData - accounts data of the wallet
 * @param allUtxos - utxos of the wallet
 * @param indexes - indexes of addresses of the wallet
 * @param network - network to work in
 * @returns Array of Utxo
 */
export function getAllSpendableUtxosByWalletData(accountsData, allUtxos, indexes, network) {
    try {
        const spendableExternalUtxos = allUtxos.external.filter(
            utxo => utxo.confirmations >= Coins.COINS.BTC.minConfirmations
        );
        const allSpendableUtxos = allUtxos.internal.concat(spendableExternalUtxos);
        const signableUtxos = getSignableUtxos(accountsData, allSpendableUtxos, indexes, network);

        return getNotDustUtxos(signableUtxos);
    } catch (e) {
        improveAndRethrow(e, "getAllSpendableUtxosByWalletData");
    }
}

/**
 * Gets only not dust utxos from the given array.
 *
 * Note that there is no check for P2SH-P2WPKH as it is not needed here due to bitcoin protocol implementation
 * considering P2SH as just non-segwit and using the same dust threshold as for P2PKH.
 *
 * @param utxos - utxos to be checked
 * @returns Array of Utxo
 */
// TODO: [tests, low] Write unit tests for payment logic
function getNotDustUtxos(utxos) {
    return utxos.filter(utxo => {
        let threshold;
        utxo.type === P2PKH_SCRIPT_TYPE && (threshold = NON_SEGWIT_DUST_THRESHOLD);
        utxo.type === P2WPKH_SCRIPT_TYPE && (threshold = SEGWIT_DUST_THRESHOLD);
        utxo.type === P2SH_SCRIPT_TYPE && (threshold = NON_SEGWIT_DUST_THRESHOLD);

        threshold == null &&
            (threshold = isSegWitAddress(utxo.address) ? SEGWIT_DUST_THRESHOLD : NON_SEGWIT_DUST_THRESHOLD);

        return utxo.value_satoshis > threshold;
    });
}

/**
 * Verifies given utxos for type to be signable in the wallet.
 * As we only support signing of P2PKH, P2WPKH and P2SH-P2WPKH outputs.
 *
 * @param accountsData - accounts data
 * @param utxos - array of utxos to be filtered
 * @param indexes - indexes of addresses
 * @param network - network of given utxos
 * @return Array of signable Utxo
 */
// TODO: [tests, low] Write unit tests for payment logic
function getSignableUtxos(accountsData, utxos, indexes, network) {
    const addresses = utxos.map(utxo => utxo.address);
    const isBip49AddressMapping = isBip49Addresses(accountsData, addresses, indexes, network);

    return utxos.reduce((filtered, utxo) => {
        if (
            utxo.type === P2PKH_SCRIPT_TYPE ||
            utxo.type === P2WPKH_SCRIPT_TYPE ||
            (utxo.type === P2SH_SCRIPT_TYPE && isBip49AddressMapping[utxo.address])
        ) {
            filtered.push(utxo);
        }
        return filtered;
    }, []);
}

/**
 * Calculates balance for given accounts data.
 * Calculates:
 *   - unconfirmed balance (sum of all values of utxos)
 *   - spendable balance (sum of all values of internal utxos plus sum of values of external utxos with at least
 *                        min number of confirmations of block to which a utxo belongs)
 *   - signable balance (sum of all values of utxos that can be signed by our wallet)
 *   - confirmed balance (sum of all values of utxos belonging to blocks with at least min number of confirmations)
 *
 * @param accountsData - accounts data
 * @param allUtxos - all utxos of the wallet (without duplicates)
 * @param indexes - indexes of addresses of the wallet
 * @param network - network to look for utxos in
 * @return Object {unconfirmed: number of satoshies, spendable: number of satoshies, signable: number of satoshies, confirmed: number of satoshies}
 */
// TODO: [tests, low] Write unit tests for payment logic
export function calculateBalanceByWalletData(accountsData, allUtxos, indexes, network) {
    try {
        const internalBalance = calculateBalanceByUtxos(allUtxos.internal, false);
        const internalConfirmedBalance = calculateBalanceByUtxos(allUtxos.internal, true);

        const externalBalance = calculateBalanceByUtxos(allUtxos.external, false);
        const externalConfirmedBalance = calculateBalanceByUtxos(allUtxos.external, true);

        const allUtxosAsArray = allUtxos.internal.concat(allUtxos.external);
        const signableUtxos = getSignableUtxos(accountsData, allUtxosAsArray, indexes, network);
        const signableBalance = calculateBalanceByUtxos(signableUtxos, false);

        return {
            unconfirmed: Math.floor(internalBalance + externalBalance),
            spendable: Math.floor(internalBalance + externalConfirmedBalance),
            signable: Math.floor(signableBalance),
            confirmed: Math.floor(internalConfirmedBalance + externalConfirmedBalance),
        };
    } catch (e) {
        improveAndRethrow(e, "calculateBalanceByWalletData");
    }
}

/**
 * Calculates dust balance for given fee rate and set of utxos.
 * WARNING: we do not check whether the UTXO is signable TODO: [feature, low] does not count non signable UTXOs here
 *
 * @param allUTXOs - all utxos of the wallet (we expect no duplicates here)
 * @param feeRate - feeRate to calculate dust UTXOs for
 * @param network - network to look for utxos in
 * @return {number} Sum of dust UTXOs
 */
// TODO: [tests, low] Write unit tests for payment logic
export function calculateDustBalanceByWalletData(allUTXOs, feeRate, network) {
    try {
        const relevantUTXOs = [
            ...allUTXOs.internal,
            ...allUTXOs.external.filter(utxo => utxo.confirmations >= Coins.COINS.BTC.minConfirmations),
        ];
        const notDust = getNotDustUTXOsInTermsOfSpecificFeeRateConsideringSendingP2WPKH(
            relevantUTXOs,
            feeRate,
            network
        );
        const dustUTXOs = relevantUTXOs.filter(
            utxo => !notDust.find(nonDustUTXO => nonDustUTXO.txid === utxo.txid && nonDustUTXO.number === utxo.number)
        );

        return dustUTXOs.reduce((prev, utxo) => prev + utxo.value_satoshis, 0);
    } catch (e) {
        improveAndRethrow(e, "calculateDustBalanceByWalletData");
    }
}

/**
 * Sums values of all given utxos.
 * Ignores:
 *   - utxos belonging to blocks with less than min confirmations if confirmedOnly flag is given
 *   - dust utxos
 *
 * @param utxos - utxos to count balance for
 * @param confirmedOnly - flag signalling whether to count only confirmed utxos
 * @returns Number - sum of given utxos (according to flag)
 */
function calculateBalanceByUtxos(utxos, confirmedOnly) {
    const onlyNotDustUtxos = getNotDustUtxos(utxos);
    return onlyNotDustUtxos.reduce((wholeSum, utxo) => {
        if (!confirmedOnly || (confirmedOnly && utxo.confirmations >= Coins.COINS.BTC.minConfirmations)) {
            return wholeSum + utxo.value_satoshis;
        }

        return wholeSum;
    }, 0 /* Initial Sum */);
}

export function getAddresses(utxos) {
    return utxos.map(utxo => utxo.address);
}

/**
 *
 * Retrieves array of all utxos that can be used in transactions to send coins.
 *
 * Returns only utxos corresponding to used addresses of given accountsData in given network.
 * Ignores:
 *   - external utxos with less than Coins.COINS.BTC.minConfirmations number of confirmations
 *   - internal utxos with 0 number of confirmations
 *   - not signable utxos (see docs for getSignableUtxos function)
 *   - dust utxos
 *
 * @param accountsData - account data needed to check signable utxos
 * @param indexes - indexes of addresses of the wallet
 * @param candidateUtxos - all utxos to get only allowed candidates
 * @param network - network to get utxos for
 * @returns Array of Utxo
 */
// TODO: [tests, low] Write unit tests for payment logic
export function getSortedListOfCandidateUtxosForRbf(accountsData, indexes, candidateUtxos, network) {
    try {
        const spendableExternalUtxos = candidateUtxos.external.filter(
            utxo => utxo.confirmations >= Coins.COINS.BTC.minConfirmations
        );
        const allSpendableUtxos = candidateUtxos.internal.concat(spendableExternalUtxos);
        const rbfAllowedUtxos = allSpendableUtxos.filter(utxo => utxo.confirmations > 0); // RBF restriction
        const signableUtxos = getSignableUtxos(accountsData, rbfAllowedUtxos, indexes, network);
        const notDustUtxos = getNotDustUtxos(signableUtxos);

        return notDustUtxos.sort((utxo1, utxo2) => utxo2.value_satoshis - utxo1.value_satoshis);
    } catch (e) {
        improveAndRethrow(e, "getSortedListOfCandidateUtxosForRbf");
    }
}

/**
 * Checks whether given amount will become dust in terms of sending to segwit/non-segwit address type.
 *
 * @param amount {number|BigNumber} amount to be checked (satoshi)
 * @param address {string} target address to send given amount to
 * @returns {{result: boolean, threshold: number }}
 */
// TODO: [tests, low] Write unit tests for payment logic
export function isAmountDustForAddress(amount, address) {
    if (is.not.number(amount) && !(amount instanceof BigNumber))
        throw new Error("Amount should be a number or BigNumber.");

    if (isSegWitAddress(address)) {
        return {
            result:
                amount instanceof BigNumber
                    ? amount.lt(BigNumber.from(SEGWIT_DUST_THRESHOLD))
                    : amount < SEGWIT_DUST_THRESHOLD,
            threshold: SEGWIT_DUST_THRESHOLD,
        };
    } else {
        return {
            result:
                amount instanceof BigNumber
                    ? amount.lt(BigNumber.from(NON_SEGWIT_DUST_THRESHOLD))
                    : amount < NON_SEGWIT_DUST_THRESHOLD,
            threshold: NON_SEGWIT_DUST_THRESHOLD,
        };
    }
}

/**
 * Returns dust threshold amount corresponding to type of given address.
 * Throws error if given address is invalid.
 *
 * @param targetAddress - address to get threshold for
 * @returns number - threshold amount
 */
// TODO: [tests, critical] Write unit tests for payment logic
export function getDustThreshold(targetAddress) {
    if (!isAddressValid(targetAddress)) {
        throw new Error(`Address is invalid: ${targetAddress}.`);
    }

    if (isSegWitAddress(targetAddress)) {
        return SEGWIT_DUST_THRESHOLD;
    } else {
        return NON_SEGWIT_DUST_THRESHOLD;
    }
}

/**
 * Retrieves id of transaction sending given output.
 * Returns null if there is no transaction sending this output.
 *
 * @param output - Output object
 * @param outputTxId -  of transaction owning the given output
 * @param transactions - Array<Transaction>
 * @return {string|null} - txid
 */
export function getTXIDSendingGivenOutput(output, outputTxId, transactions) {
    const correspondingTx = transactions.find(tx =>
        tx.inputs.find(
            input =>
                input.txid === outputTxId &&
                input.address === output.addresses[0] &&
                input.output_number === output.number
        )
    );

    return correspondingTx?.txid || null;
}

/**
 * Returns type of output according to given address.
 * WARNING: This function analyse only few types of outputs so make sure it is ok for you.
 *          We ignore P2WSH and other types here. P2PKH will by used by default.
 * @param address - address to get type of Output for
 * @return {string} one of constants P2PKH_SCRIPT_TYPE|P2WPKH_SCRIPT_TYPE|P2SH_SCRIPT_TYPE
 */
// TODO: [tests, low] Write unit tests for payment logic
export function getOutputTypeByAddress(address) {
    let type = P2PKH_SCRIPT_TYPE;
    if (isSegWitAddress(address)) {
        type = P2WPKH_SCRIPT_TYPE;
    } else if (isP2shAddress(address)) {
        type = P2SH_SCRIPT_TYPE;
    }

    return type;
}
