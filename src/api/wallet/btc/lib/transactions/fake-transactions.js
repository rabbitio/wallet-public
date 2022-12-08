import { getMappingOfAddressesToRandomEcPair } from "../addresses";
import { getAddresses, isAmountDustForAddress } from "../utxos";
import { buildTransaction } from "./build-transaction";
import { calculateFeeByFeeRate } from "../fees";
import { TxData } from "../../../common/models/tx-data";
import { improveAndRethrow } from "../../../../common/utils/errorUtils";
import {
    getFeePlusSendingAmountOverlapsBalanceErrorData,
    getSortedNotDustUtxosInTermsOfSpecificFeeRate,
} from "./transactions-utils";

/**
 * Creates TxData by given parameters if it possible. Method useful when you have no private keys to build transaction
 * and get all final parameters like change amount, final fee for specific rate.
 *
 * Algorithm of UTXOs selection is encapsulated here. Note that it is pretty straightforward and
 * can fail to select appropriate UTXOs in some cases. TODO: [docs, moderate] describe cases
 *
 * @param amount {number} amount to be sent (satoshi)
 * @param address {string} address to send coins to
 * @param changeAddress {string} change address
 * @param feeRate {FeeRate} rate to calculate fee for
 * @param utxos {Utxo[]} all available candidate utxos of the wallet
 * @param network {Network} network to create transaction in
 * @return {TxData|Object} tx data or error object (see getFeePlusSendingAmountOverlapsBalanceErrorData)
 */
export function createFakeTransaction(amount, address, changeAddress, feeRate, utxos, network) {
    try {
        const ecPairsMapping = getMappingOfAddressesToRandomEcPair(getAddresses(utxos), network);
        const sortedUtxos = getSortedNotDustUtxosInTermsOfSpecificFeeRate(
            utxos,
            feeRate,
            address,
            ecPairsMapping,
            network
        );

        const selectedUtxos = [];
        let currentSum = 0;
        for (let i = 0; i < sortedUtxos.length; ++i) {
            selectedUtxos.push(sortedUtxos[i]);
            currentSum += sortedUtxos[i].value_satoshis;

            if (currentSum > amount) {
                // Sum is enough at least to cover paying amount
                let change = currentSum - amount;

                let tx = buildTransaction(
                    amount,
                    address,
                    change,
                    changeAddress,
                    selectedUtxos,
                    ecPairsMapping,
                    network
                );
                const fee = calculateFeeByFeeRate(tx, feeRate);

                // TODO: [feature, moderate] Implement here the same algorithm as for RBF options calculation - based
                //       on two transactions one with change and one without
                if (change >= fee) {
                    change = change - fee;
                    // TODO: [refactoring, moderate] Maybe remove this call - it is placed just to verify that build is ok
                    buildTransaction(amount, address, change, changeAddress, selectedUtxos, ecPairsMapping, network);
                    return new TxData(amount, address, change, fee, changeAddress, selectedUtxos, network, feeRate);
                }
            }
        }

        return getFeePlusSendingAmountOverlapsBalanceErrorData();
    } catch (e) {
        improveAndRethrow(e, "createFakeTransaction");
    }
}

/**
 * Creates transaction sending all available outputs to specified address without change.
 *
 * Major idea is to add all spendable outputs to transaction except ones adding more fee than value.
 *
 * @param address - address to send all coins to
 * @param feeRate - rate to be used for fee calculation
 * @param utxos - all available candidate utxos of the wallet
 * @param network - network to perform operation within
 * @return TxData or error Object
 */
export function createFakeSendAllTransaction(address, feeRate, utxos, network) {
    try {
        const ecPairsMapping = getMappingOfAddressesToRandomEcPair(getAddresses(utxos), network);
        const goodUtxos = getSortedNotDustUtxosInTermsOfSpecificFeeRate(
            utxos,
            feeRate,
            address,
            ecPairsMapping,
            network
        );

        const amountOfGoodUtxos = goodUtxos.reduce((sum, utxo) => sum + utxo.value_satoshis, 0);
        const txOfGoodUtxos = buildTransaction(amountOfGoodUtxos, address, 0, null, goodUtxos, ecPairsMapping, network);
        const feeOfGoodUtxos = calculateFeeByFeeRate(txOfGoodUtxos, feeRate);

        if (!isAmountDustForAddress(amountOfGoodUtxos - feeOfGoodUtxos, address).result) {
            const finalAmount = amountOfGoodUtxos - feeOfGoodUtxos;
            buildTransaction(finalAmount, address, 0, null, goodUtxos, ecPairsMapping, network); // Just to verify build is ok

            return new TxData(finalAmount, address, 0, feeOfGoodUtxos, null, goodUtxos, network, feeRate);
        }

        return getFeePlusSendingAmountOverlapsBalanceErrorData();
    } catch (e) {
        improveAndRethrow(e, "createFakeSendAllTransaction");
    }
}
