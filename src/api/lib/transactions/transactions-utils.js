import { satoshiToBtc } from "../btc-utils";
import { getMappingOfAddressesToRandomEcPair, getNetworkByAddress } from "../addresses";
import { getAddresses, MIN_CONFIRMATIONS } from "../utxos";
import { calculateFeeByFeeRate } from "../fees";
import { improveAndRethrow } from "../../utils/errorUtils";
import { mainnet } from "../networks";
import { buildTransactionUnsafe } from "./build-transaction";

/**
 * Selects only utxos with value covering fee required to add them to transaction in terms of specified fee rate.
 *
 * TODO: [feature, low] Algorithm is not optimal as it is using greatest utxo as base for tx due to main algorithm
                        of utxos selection for transaction (just descending order for now). So the algorithm should be
                        updated in case of modification of main algorithm.
 * @param utxos - utxos to select proper ones from
 * @param feeRate - desired fee rate
 * @param address - target address for sending specified amount
 * @param ecPairsMapping - mapping for addresses of all given utxos to random ecPair
 * @param network - network to operate in
 * @returns Array of utxos
 */
export function getSortedNotDustUtxosInTermsOfSpecificFeeRate(utxos, feeRate, address, ecPairsMapping, network) {
    if (!utxos.length) return [];

    const sortedUtxos = utxos.sort((utxo1, utxo2) => utxo2.value_satoshis - utxo1.value_satoshis);
    const goodUtxos = [sortedUtxos[0]];
    const txOfBiggestUtxo = buildTransactionUnsafe(
        sortedUtxos[0].value_satoshis,
        address,
        0,
        null,
        goodUtxos,
        ecPairsMapping,
        network
    );
    const feeOfBiggestUtxo = calculateFeeByFeeRate(txOfBiggestUtxo, feeRate);
    for (let i = 1; i < sortedUtxos.length; ++i) {
        const tempUtxos = [sortedUtxos[0], sortedUtxos[i]];
        const tempAmount = sortedUtxos[0].value_satoshis + sortedUtxos[i].value_satoshis;
        const newTx = buildTransactionUnsafe(tempAmount, address, 0, null, tempUtxos, ecPairsMapping, network);
        const newFee = calculateFeeByFeeRate(newTx, feeRate);
        if (newFee - feeOfBiggestUtxo <= sortedUtxos[i].value_satoshis) {
            goodUtxos.push(sortedUtxos[i]);
        }
    }

    return goodUtxos;
}

export function getFeePlusSendingAmountOverlapsBalanceErrorData() {
    return {
        result: false,
        errorDescription:
            "The entered amount and BTC network fee is greater than the current balance in your account. ",
        howToFix:
            "Try using a smaller fee (greater blocks count) or wait for any in progress transactions to be confirmed before continuing. ",
    };
}

export function getNetworkByTransaction(tx) {
    const output = tx.outputs.filter(output => output.addresses[0])[0];
    if (output) {
        return getNetworkByAddress(output.addresses[0]);
    }

    throw new Error("No address in output. Occurred during recognition of network by tx.");
}

export function hasMinConfirmations(tx) {
    return tx.confirmations >= MIN_CONFIRMATIONS;
}

export function satoshiAmountToAnotherDenomination(satoshiAmount, denomination) {
    if (denomination === "satoshi") {
        return satoshiAmount;
    } else if (denomination === "BTC") {
        return satoshiToBtc(satoshiAmount);
    }
}

export function getDenomination(isSatoshiMode) {
    return isSatoshiMode ? "satoshi" : "BTC";
}

/**
 * Calculates sum of outputs of given transactions sending to given address.
 *
 * @param address - address to calculate sum for
 * @param transactionsList - list of transactions to get outputs from
 * @returns number - sum of outputs sending to given address
 */
export function getSumOfOutputsSendingToAddressByTransactionsList(address, transactionsList) {
    if (!(transactionsList instanceof Array)) {
        throw new Error("Transactions list should be an array. ");
    }

    return transactionsList.reduce((prev, tx) => {
        if (!tx.outputs || !Array.isArray(tx.outputs) || !tx.outputs.length) {
            return prev;
        }

        return (
            prev +
            tx.outputs.reduce((prevOutputSum, output) => {
                if (!output?.addresses || !Array.isArray(output.addresses) || !output.addresses.length) {
                    return prevOutputSum;
                }

                return (
                    prevOutputSum +
                    (output.addresses.find(outputAddress => outputAddress === address) ? output.value_satoshis : 0)
                );
            }, 0)
        );
    }, 0);
}

/**
 * Filters given list for UTXOs that are not dust in terms of sending to given fee rate.
 * We use random address of P2WPKH to perform the calculation. It is because such outputs are the smallest comparin to
 * other address types when adding output to a transaction. It can change in the future but it is not critical.
 * Also Segwit addresses are preferred ones now so this adds even more to this address choice.
 *
 * @param utxos - list of UTXOs
 * @param feeRate - rate to be used for fee calculation
 * @param network - network to work in
 * @return {Array<Utxo>} - list of not dust UTXOs in terms of given rate
 */
export function getNotDustUTXOsInTermsOfSpecificFeeRateConsideringSendingP2WPKH(utxos, feeRate, network) {
    try {
        const mapping = getMappingOfAddressesToRandomEcPair(getAddresses(utxos), network);
        const randomAddress =
            network.key === mainnet.key
                ? "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"
                : "tb1qqzd0guwv9vtdlwe4uppe4c9ym7jt3dq2rf5wm6";

        return getSortedNotDustUtxosInTermsOfSpecificFeeRate(utxos, feeRate, randomAddress, mapping, network);
    } catch (e) {
        improveAndRethrow(e, "getNotDustUTXOsInTermsOfSpecificFeeRateConsideringSendingP2WPKH");
    }
}
