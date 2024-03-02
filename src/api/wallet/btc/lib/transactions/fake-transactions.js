import { BigNumber } from "bignumber.js";

import { AmountUtils, improveAndRethrow } from "@rabbitio/ui-kit";

import { EcPairsUtils } from "../addresses.js";
import { getAddresses, Utxos } from "../utxos.js";
import { BtcTransactionBuilder } from "./build-transaction.js";
import { BtcFeeCalculatorByFeeRate } from "../fees.js";
import { TxData } from "../../../common/models/tx-data.js";
import {
    getFeePlusSendingAmountOverlapsBalanceErrorData,
    getSortedNotDustUtxosInTermsOfSpecificFeeRate,
} from "./transactions-utils.js";

export class BtcFakeTransactionsBuilder {
    /**
     * Creates TxData by given parameters if it possible. Method useful when you have no private keys to build transaction
     * and get all final parameters like change amount, final fee for specific rate.
     *
     * Algorithm of UTXOs selection is encapsulated here. Note that it is pretty straightforward and
     * can fail to select appropriate UTXOs in some cases.
     *
     * TODO: [docs, moderate] describe cases and improve algorithm task_id=5bba4dda33984b4aaeaa40bcf5313596
     *
     * @param amount {string} amount to be sent (satoshi)
     * @param address {string} address to send coins to
     * @param changeAddress {string} change address
     * @param feeRate {FeeRate} rate to calculate fee for
     * @param utxos {Utxo[]} all available candidate utxos of the wallet
     * @param network {Network} network to create transaction in
     * @return {TxData|{ result: false, errorDescription; string, howToFix: string}} tx data or error object
     */
    static createFakeTransaction(amount, address, changeAddress, feeRate, utxos, network) {
        try {
            const ecPairsMapping = EcPairsUtils.getMappingOfAddressesToRandomEcPair(getAddresses(utxos), network);
            const sortedUtxos = getSortedNotDustUtxosInTermsOfSpecificFeeRate(
                utxos,
                feeRate,
                address,
                ecPairsMapping,
                network
            );

            if (Utxos.isAmountDustForAddress(amount, address).result) {
                // TODO: [feature, moderate] return TxData here too. task_id=c6771140cfce44049a8ce600032bb3af
                return getFeePlusSendingAmountOverlapsBalanceErrorData();
            }

            const selectedUtxos = [];
            let currentSum = BigNumber(0);
            for (let i = 0; i < sortedUtxos.length; ++i) {
                selectedUtxos.push(sortedUtxos[i]);
                currentSum = currentSum.plus(sortedUtxos[i].value_satoshis);

                if (currentSum.gt(amount)) {
                    // Sum is enough at least to cover paying amount
                    let change = currentSum.minus(amount);

                    // TODO: [feature, moderate] change can be dust at the first call and not dust at second. task_id=b1bbe260001f4a74ba771b80827420a8
                    let tx = BtcTransactionBuilder.buildTransaction(
                        AmountUtils.intStr(amount),
                        address,
                        AmountUtils.intStr(change),
                        changeAddress,
                        selectedUtxos,
                        ecPairsMapping,
                        network
                    );
                    const fee = BigNumber(BtcFeeCalculatorByFeeRate.calculateFeeByFeeRate(tx, feeRate));

                    // TODO: [feature, moderate] Implement here the same algorithm as for RBF options calculation - based
                    //       on two transactions one with change and one without. task_id=b1bbe260001f4a74ba771b80827420a8
                    // TODO: [bug, high] change can be dust before this and after recalculating. task_id=b1bbe260001f4a74ba771b80827420a8
                    if (change.gte(fee)) {
                        change = change.minus(fee);
                        // TODO: [refactoring, moderate] Maybe remove this call - it is placed just to verify that build is ok. task_id=b1bbe260001f4a74ba771b80827420a8
                        const amountString = AmountUtils.intStr(amount);
                        const changeString = AmountUtils.intStr(change);
                        const feeString = AmountUtils.intStr(fee);

                        BtcTransactionBuilder.buildTransaction(
                            amountString,
                            address,
                            changeString,
                            changeAddress,
                            selectedUtxos,
                            ecPairsMapping,
                            network
                        );
                        return new TxData(
                            amountString,
                            address,
                            changeString,
                            feeString,
                            changeAddress,
                            selectedUtxos,
                            network,
                            feeRate
                        );
                    }
                }
            }

            // TODO: [feature, moderate] return TxData here too. task_id=c6771140cfce44049a8ce600032bb3af
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
     * @param address {string} address to send all coins to
     * @param feeRate {FeeRate} rate to be used for fee calculation
     * @param utxos {Utxo[]} all available candidate utxos of the wallet
     * @param network {Network} network to perform operation within
     * @return {TxData|{ result: false, errorDescription: string, howToFix: string }}
     */
    static createFakeSendAllTransaction(address, feeRate, utxos, network) {
        try {
            const ecPairsMapping = EcPairsUtils.getMappingOfAddressesToRandomEcPair(getAddresses(utxos), network);
            const goodUtxos = getSortedNotDustUtxosInTermsOfSpecificFeeRate(
                utxos,
                feeRate,
                address,
                ecPairsMapping,
                network
            );

            const amountOfGoodUtxos = goodUtxos.reduce((sum, utxo) => sum.plus(utxo.value_satoshis), BigNumber("0"));
            const amountOfGoodUtxosString = AmountUtils.intStr(amountOfGoodUtxos);
            if (Utxos.isAmountDustForAddress(amountOfGoodUtxosString, address).result) {
                // TODO: [feature, moderate] return TxData here too. task_id=c6771140cfce44049a8ce600032bb3af
                return getFeePlusSendingAmountOverlapsBalanceErrorData();
            }

            const txOfGoodUtxos = BtcTransactionBuilder.buildTransaction(
                amountOfGoodUtxosString,
                address,
                "0",
                null,
                goodUtxos,
                ecPairsMapping,
                network
            );
            const feeOfGoodUtxos = BigNumber(BtcFeeCalculatorByFeeRate.calculateFeeByFeeRate(txOfGoodUtxos, feeRate));

            const finalAmountString = AmountUtils.intStr(amountOfGoodUtxos.minus(feeOfGoodUtxos));
            if (!Utxos.isAmountDustForAddress(finalAmountString, address).result) {
                BtcTransactionBuilder.buildTransaction(
                    finalAmountString,
                    address,
                    "0",
                    null,
                    goodUtxos,
                    ecPairsMapping,
                    network
                ); // Just to verify build is ok

                const feeOfGoodUtxosString = AmountUtils.intStr(feeOfGoodUtxos);
                return new TxData(
                    finalAmountString,
                    address,
                    "0",
                    feeOfGoodUtxosString,
                    null,
                    goodUtxos,
                    network,
                    feeRate
                );
            }

            // TODO: [feature, moderate] return TxData here too. task_id=c6771140cfce44049a8ce600032bb3af
            return getFeePlusSendingAmountOverlapsBalanceErrorData();
        } catch (e) {
            improveAndRethrow(e, "createFakeSendAllTransaction");
        }
    }
}
