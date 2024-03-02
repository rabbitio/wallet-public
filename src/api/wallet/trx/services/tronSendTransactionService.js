import { BigNumber } from "bignumber.js";

import { AmountUtils, improveAndRethrow } from "@rabbitio/ui-kit";

import { tronUtils } from "../adapters/tronUtils.js";
import { TxData } from "../../common/models/tx-data.js";
import { Trc20TransferEnergyEstimationProvider } from "../../trc20token/external-apis/trc20TransferEnergyEstimationProvider.js";
import { TrxAddressesService } from "./trxAddressesService.js";
import { Coins } from "../../coins.js";
import { TronNetworkConstantsService } from "./tronNetworkConstantsService.js";
import { TronBlockchainBalancesService } from "./tronBlockchainBalancesService.js";
import { validateTronAddress } from "../lib/addresses.js";
import { KeysBip44 } from "../../common/lib/keysBip44.js";
import { Storage } from "../../../common/services/internal/storage.js";
import { safeStringify } from "../../../common/utils/browserUtils.js";
import { FeeEstimationUtils } from "../../common/utils/feeEstimationUtils.js";
import { TronAccountExistenceProvider } from "../external-apis/tronAccountExistanceProvider.js";
import { TRC20 } from "../../trc20token/trc20Protocol.js";
import { Logger } from "../../../support/services/internal/logs/logger.js";

// TODO: [tests, critical] Units required
export class TronSendTransactionService {
    /**
     * Creates single option array for transaction sending.
     * Tron blockchain blocks appear fast (~3sec as for 2023 Feb) so they have no native prioritisation mechanism.
     * So we calculate the only option of fee.
     * We take into account available bandwidth and energy and reduce the fee according to these values.
     *
     * @param coin {Coin} coin to be sent
     * @param addressToBase58 {string} target Tron blockchain address base58
     * @param coinAmount {string|null} amount to be sent, ignored for send all
     * @param isSendAll {boolean} true if we need to send all available coins except fee
     * @param network {Network} network to work in
     * @param balanceCoins {string} sending coin balance
     * @param [isAddressFake=false] {boolean} whether given target address is not the one you will send the coins
     *                                        to using the result of this estimation
     * @return {Promise<
     *             {
     *                 result: true,
     *                 txsDataArray: [TxData],
     *                 isFeeCoinBalanceZero: boolean,
     *                 isFeeCoinBalanceNotEnoughForAllOptions: boolean,
     *             }>}
     */
    static async createTronBlockchainCoinTransactionsWithFakeSignatures(
        coin,
        addressToBase58,
        coinAmount,
        isSendAll,
        network,
        balanceCoins,
        isAddressFake = false
    ) {
        try {
            const usesDifferentCoinFee = coin.doesUseDifferentCoinFee();
            if (isSendAll && usesDifferentCoinFee) {
                /* We set sending amount to balance if the coin is not Tron itself.
                 * We need this for sendAll case as the actually passed coinAmount is null.
                 * But we also should set correct coinAmount for send all case when sending TRX -
                 * we will do this later below because we can do this only after the fee calculation
                 * and before this we actually use the coinAmount only for not Tron coin cases.
                 */
                coinAmount = balanceCoins;
            }
            const amountToSendAtoms = coin.coinAmountToAtoms(coinAmount);
            const addressFromBase58 = TrxAddressesService.getCurrentTrxAddress();
            let requiredBandwidth = "0";
            let requiredEnergy = "0";
            let priceForTargetAccountCreationSuns = "0";
            if (coin.protocol === TRC20) {
                /* If the passed address is fake we use random not activated valid address as empirically we discovered
                 * that not activated tron addresses require significantly more energy to send to them.
                 *
                 * NOTE: we should use really random address here as it is used only for estimation and isn't being
                 * saved for any further steps.
                 */
                const randomNotActivatedAddressBase58 = "TKSrBySJ5LKzwDiwhMMqtwt8T7FL766ZfU";
                const addressForEstimation = isAddressFake ? randomNotActivatedAddressBase58 : addressToBase58;
                const resolvedPromises = await Promise.all([
                    await Trc20TransferEnergyEstimationProvider.estimateTrc20TransferEnergy(
                        coin,
                        addressFromBase58,
                        addressForEstimation,
                        amountToSendAtoms
                    ),
                    await tronUtils.buildTrc20TransferTransactionHex(
                        coin.tokenAddress,
                        addressFromBase58,
                        addressForEstimation,
                        amountToSendAtoms
                    ),
                ]);
                requiredEnergy = AmountUtils.intStr(resolvedPromises[0]);
                requiredBandwidth = AmountUtils.intStr(resolvedPromises[1]?.length);
            } else if (coin === Coins.COINS.TRX) {
                /* We use some 100% present account address because tron fails to create transaction if account doesn't exist
                 * NOTE 1: supported testnet is nile
                 * NOTE 2: you will not be able to send to this address - fee estimation will fail
                 */
                const existingAccount =
                    FeeEstimationUtils.getWalletAddressToUseAsFromAddressForTokenSendingEstimation(TRC20);
                /* This value should not exceed tron balance of the hardcoded address we use for estimation. So we
                 * use the smallest possible. Greater value can add just few bytes to the hex transaction. We handle
                 * this by increasing the whole estimation a bit below.
                 */
                const sendAmountSunsForEstimation = "1";
                const hexTrxSendTx = await tronUtils.buildTrxTransferTransactionHex(
                    existingAccount,
                    addressToBase58,
                    sendAmountSunsForEstimation
                );
                requiredBandwidth = AmountUtils.intStr(hexTrxSendTx.length);
                /* We set 1 TRX fee if we don't know exact address the transaction will be sent to as the actual target
                 * address can be 'not activated' and for such addresses we should add 1 TRX fee to the whole estimation.
                 * And if we know the exact target address we check its existence and add 1 TRX fee if it is
                 * not activated.
                 *
                 * Note that this works only for TRX-TRX transfers. This is not applicable for TRC20 transfers.
                 */
                if (isAddressFake) {
                    priceForTargetAccountCreationSuns = "1000000";
                } else {
                    const doesAddressExist = await TronAccountExistenceProvider.doesTronAccountExist(addressToBase58);
                    priceForTargetAccountCreationSuns = doesAddressExist ? "0" : "1000000";
                }
            } else {
                throw new Error("Not supported coin passed: " + coin?.ticker);
            }
            const [{ bandwidthPriceSuns, energyPriceSuns }, { availableBandwidth, availableEnergy }] =
                await Promise.all([
                    TronNetworkConstantsService.getTronResourcesPrices(),
                    TronBlockchainBalancesService.getTronAccountResources(),
                ]);
            const bandwidthMultiplier = "1.1"; // Because bandwidth is not exactly 1:1 with length, but usually pretty the same
            const requiredBandwidthMultiplied = BigNumber(requiredBandwidth).times(bandwidthMultiplier);
            let bandwidthToPayFor = requiredBandwidthMultiplied;
            if (
                requiredBandwidthMultiplied.lte(availableBandwidth ?? "0") &&
                BigNumber(priceForTargetAccountCreationSuns).eq("0")
            ) {
                /* Tron uses free bandwidth only if it can cover the whole required bandwidth amount.
                 * Also it is not documented clearly, but TRX->TRX sending to not-activated account fails when we try
                 * to send all available coins minus 1 TRX activation fee with bandwidth covered from account stock.
                 *
                 * So the free bandwidth will be used only when it covers the required bandwidth completely and we send
                 * TRX to activated address.
                 */
                bandwidthToPayFor = BigNumber("0");
            }
            const bandwidthFee = bandwidthToPayFor.times(bandwidthPriceSuns);
            const energyToPayFor = BigNumber(requiredEnergy).gt(availableEnergy ?? "0")
                ? BigNumber(requiredEnergy).minus(availableEnergy ?? "0")
                : BigNumber("0");
            const energyFee = energyToPayFor.times(energyPriceSuns);
            const multiplierToMinimizeTheRiskOfStackingDueToNotEnoughFee = "1.05";
            const totalFeeSuns = BigNumber(bandwidthFee)
                .plus(energyFee)
                .times(multiplierToMinimizeTheRiskOfStackingDueToNotEnoughFee)
                .plus(priceForTargetAccountCreationSuns);
            let sendingCoinBalanceAtoms = coin.coinAmountToAtoms(balanceCoins);
            let finalAmountAtoms = amountToSendAtoms;
            if (isSendAll && !usesDifferentCoinFee) {
                /* Here we finally set correct sending amount for send all case for Tron coin case.
                 * Now this is possible as we have fee value here.
                 * Note: case sending TRC20 token was handled above so the amount for this case is correct here.
                 */
                finalAmountAtoms = AmountUtils.intStr(BigNumber(sendingCoinBalanceAtoms).minus(totalFeeSuns));
            }
            let feeBalanceAtoms = sendingCoinBalanceAtoms;
            if (usesDifferentCoinFee) {
                /* If we are working with TRC20 token here we need to request the TRX balance
                 * for further calculations. */
                const feeBalanceCoins = await TronBlockchainBalancesService.getBalance(coin.feeCoin);
                feeBalanceAtoms = coin.feeCoin.coinAmountToAtoms(feeBalanceCoins);
            }
            // TODO: [refactoring, moderate] extract this logic as it is coin-independent and is being duplicated
            let isEnoughBalance;
            if (isSendAll && usesDifferentCoinFee) {
                isEnoughBalance = BigNumber(feeBalanceAtoms).gte(totalFeeSuns);
            } else if (isSendAll && !usesDifferentCoinFee) {
                // We cannot send less than 1 sun in pure TRX transfer tx so comparing strictly here
                isEnoughBalance = BigNumber(sendingCoinBalanceAtoms).gt(totalFeeSuns);
            } else if (usesDifferentCoinFee) {
                isEnoughBalance =
                    BigNumber(feeBalanceAtoms).gte(totalFeeSuns) &&
                    BigNumber(sendingCoinBalanceAtoms).gte(amountToSendAtoms);
            } else {
                isEnoughBalance = BigNumber(sendingCoinBalanceAtoms).gte(
                    BigNumber(amountToSendAtoms).plus(totalFeeSuns)
                );
            }

            Logger.log(
                `Tron fee features:\nBandw. price: ${bandwidthPriceSuns}\n Bandw. available: ${availableBandwidth}\nBandw. (len): ${requiredBandwidth}\nBandw. to pay for (cnt): ${bandwidthToPayFor.toString()}\nBandw. fee suns: ${bandwidthFee.toString()}\nEnergy price (suns): ${energyPriceSuns}\nEnergy available:${availableEnergy}\nEnergy est.:%{requiredEnergy}\nEnergy exc. avail.:${energyToPayFor.toString()}\nEnergy fee suns: ${energyFee.toString()}\nTotal fee suns: ${totalFeeSuns.toString()}\nSend coin balance: ${sendingCoinBalanceAtoms}\nFee coin balance:${feeBalanceAtoms}\nIs enough: ${isEnoughBalance}\nFinal amount: ${finalAmountAtoms}`
            );

            const txsData = [
                new TxData(
                    finalAmountAtoms,
                    addressToBase58,
                    null,
                    AmountUtils.intStr(totalFeeSuns),
                    null,
                    null,
                    network,
                    {
                        rate: energyPriceSuns,
                    }
                ),
            ];

            /**
             * We don't provide error object for case when the balance is not enough because we want user to see the
             * fee estimation anyway. But we provide two flags about the not enough end zero balance for fee.
             */
            return {
                result: true,
                txsDataArray: txsData,
                isFeeCoinBalanceZero: BigNumber(feeBalanceAtoms).isZero(),
                isFeeCoinBalanceNotEnoughForAllOptions: !isEnoughBalance,
            };
        } catch (e) {
            improveAndRethrow(e, "createTronBlockchainCoinTransactionsWithFakeSignatures");
        }
    }

    static _calculateTronPrivateKey(coin, mnemonic, passphrase) {
        try {
            const keys = KeysBip44.generateKeysForAccountAddressByWalletCredentials(
                mnemonic,
                passphrase,
                Storage.getCurrentNetwork(coin),
                0,
                0
            );
            if (keys?.privateKey) {
                return keys.privateKey.toString("hex");
            }
            throw new Error("Failed to calculate private key for tron: " + safeStringify(keys));
        } catch (e) {
            improveAndRethrow(e, "_calculateTronPrivateKey");
        }
    }

    static async createTronBlockchainTransactionAndBroadcast(coin, mnemonic, passphrase, txData) {
        try {
            const fromAddress = TrxAddressesService.getCurrentTrxAddress();
            const privateKey = this._calculateTronPrivateKey(coin, mnemonic, passphrase);

            let id;
            if (coin === Coins.COINS.TRX) {
                id = await tronUtils.createSignAndBroadcastTrxTransferTransaction(
                    fromAddress,
                    txData.address,
                    txData.amount,
                    privateKey
                );
            } else if (coin?.protocol === TRC20) {
                id = await tronUtils.createSignAndBroadcastTrc20TransferTransaction(
                    coin.tokenAddress,
                    fromAddress,
                    txData.address,
                    txData.amount,
                    privateKey
                );
            } else {
                throw new Error("Provided coin is not supported: " + coin?.ticker);
            }
            return id;
        } catch (e) {
            improveAndRethrow(e, "createTronBlockchainTransactionAndBroadcast");
        }
    }

    static validateAddressForSending(address) {
        try {
            const currentWalletAddress = TrxAddressesService.getCurrentTrxAddress();
            if (address === currentWalletAddress) {
                return { result: false, errorDescription: "Tron doesn`t allow to send transactions to yourself." };
            }
            return { result: validateTronAddress(address) };
        } catch (e) {
            improveAndRethrow(e, "validateAddressForSending");
        }
    }
}
