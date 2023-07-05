import { BigNumber } from "ethers";

import { tronUtils } from "../adapters/tronUtils";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { TxData } from "../../common/models/tx-data";
import { Trc20TransferEnergyEstimationProvider } from "../../trc20token/external-apis/trc20TransferEnergyEstimationProvider";
import { TrxAddressesService } from "./trxAddressesService";
import { Coins } from "../../coins";
import { TronNetworkConstantsService } from "./tronNetworkConstantsService";
import { TronBlockchainBalancesService } from "./tronBlockchainBalancesService";
import { Coin } from "../../common/models/coin";
import { validateTronAddress } from "../lib/addresses";
import { KeysBip44 } from "../../common/lib/keysBip44";
import { getCurrentNetwork } from "../../../common/services/internal/storage";
import { safeStringify } from "../../../common/utils/browserUtils";
import { FeeEstimationUtils } from "../../common/utils/feeEstimationUtils";
import { TronAccountExistenceProvider } from "../external-apis/tronAccountExistanceProvider";

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
     * @param coinAmount {string} amount to be sent, ignored for send all
     * @param isSendAll {boolean} true if we need to send all available coins except fee
     * @param network {Network} network to work in
     * @param balanceCoins {string} sending coin balance
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
        balanceCoins
    ) {
        try {
            const amountToSendAtoms = coin.coinAmountToAtoms(coinAmount);
            const addressFromBase58 = TrxAddressesService.getCurrentTrxAddress();
            let requiredBandwidth = 0;
            let requiredEnergy = 0;
            let priceForTargetAccountCreationSuns = 0;
            if (coin.protocol === Coin.PROTOCOLS.TRC20) {
                const resolvedPromises = await Promise.all([
                    await Trc20TransferEnergyEstimationProvider.estimateTrc20TransferEnergy(
                        coin,
                        addressFromBase58,
                        addressToBase58,
                        amountToSendAtoms
                    ),
                    await tronUtils.buildTrc20TransferTransactionHex(
                        coin.tokenAddress,
                        addressFromBase58,
                        addressToBase58,
                        amountToSendAtoms
                    ),
                ]);
                requiredEnergy = resolvedPromises[0];
                requiredBandwidth = resolvedPromises[1]?.length;
            } else if (coin === Coins.COINS.TRX) {
                /* We use some 100% present account address because tron fails to create transaction if account doesn't exist
                 * NOTE 1: supported testnet is nile
                 * NOTE 2: you will not be able to send to this address - fee estimation will fail
                 */
                const existingAccount = FeeEstimationUtils.getWalletAddressToUseAsFromAddressForTokenSendingEstimation(
                    Coin.PROTOCOLS.TRC20
                );
                /* This value should not exceed tron balance of the hardcoded address we use for estimation. So we
                 * use the smallest possible. Greater value can add just few bytes to the hex transaction. We handle
                 * this by increasing the whole estimation a bit below.
                 */
                const sendAmountSunsForEstimation = "1";
                const [hexTrxSendTx, doesTargetAddressExist] = await Promise.all([
                    tronUtils.buildTrxTransferTransactionHex(
                        existingAccount,
                        addressToBase58,
                        sendAmountSunsForEstimation
                    ),
                    TronAccountExistenceProvider.doesTronAccountExist(addressToBase58),
                ]);
                requiredBandwidth = hexTrxSendTx.length;
                priceForTargetAccountCreationSuns = doesTargetAddressExist ? 0 : 1_000_000; // If user sends TRX to not activated account he/she should pay 1 TRX to activate it
            } else {
                throw new Error("Not supported coin passed: " + coin?.ticker);
            }
            // TODO: [feature, critical] Ignore available resources when sending to not existing address as it costs 1TRX + 100 bandw??? task_id=67589bd2e5634e23aae35ad1935d4c2d
            const [
                { bandwidthPriceSuns, energyPriceSuns },
                { availableBandwidth, availableEnergy },
            ] = await Promise.all([
                TronNetworkConstantsService.getTronResourcesPrices(),
                TronBlockchainBalancesService.getTronAccountResources(),
            ]);
            const bandwidthMultiplier = 1.1; // Because bandwidth is not exactly 1:1 with length, but usually pretty the same
            const requiredBandwidthMultiplied = requiredBandwidth * bandwidthMultiplier;
            // Tron uses free bandwidth only if it can completely cover the required bandwidth amount
            const bandwidthToPayFor =
                requiredBandwidthMultiplied > (availableBandwidth ?? 0) ? requiredBandwidthMultiplied : 0;
            const bandwidthFee = bandwidthToPayFor * bandwidthPriceSuns;
            const energyToPayFor =
                requiredEnergy > (availableEnergy ?? 0) ? requiredEnergy - (availableEnergy ?? 0) : 0;
            const energyFee = energyToPayFor * energyPriceSuns;
            const multiplierToMinimizeTheRiskOfStackingDueToNotEnoughFee = 1.05;
            const totalFeeSuns =
                Math.round((bandwidthFee + energyFee) * multiplierToMinimizeTheRiskOfStackingDueToNotEnoughFee) +
                priceForTargetAccountCreationSuns;
            let sendingCoinBalanceAtoms = coin.coinAmountToAtoms(balanceCoins);
            let feeBalanceAtoms = sendingCoinBalanceAtoms;
            const usesDifferentCoinFee = coin.doesUseDifferentCoinFee();
            if (usesDifferentCoinFee) {
                const feeBalanceCoins = await TronBlockchainBalancesService.getBalance(coin.feeCoin);
                feeBalanceAtoms = coin.feeCoin.coinAmountToAtoms(feeBalanceCoins);
            }
            // TODO: [refactoring, moderate] extract this logic as it is coin-independent and is being duplicated
            let isEnoughBalance;
            if (isSendAll && usesDifferentCoinFee) {
                isEnoughBalance = BigNumber.from(feeBalanceAtoms).gte(totalFeeSuns);
            } else if (isSendAll && !usesDifferentCoinFee) {
                // We cannot send less than 1 sun in pure TRX transfer tx so comparing strictly here
                isEnoughBalance = BigNumber.from(sendingCoinBalanceAtoms).gt(totalFeeSuns);
            } else if (usesDifferentCoinFee) {
                isEnoughBalance =
                    BigNumber.from(feeBalanceAtoms).gte(totalFeeSuns) &&
                    BigNumber.from(sendingCoinBalanceAtoms).gte(amountToSendAtoms);
            } else {
                isEnoughBalance = BigNumber.from(sendingCoinBalanceAtoms).gte(
                    BigNumber.from(amountToSendAtoms).add(totalFeeSuns)
                );
            }

            let finalAmountAtoms = amountToSendAtoms;
            if (isSendAll) {
                if (usesDifferentCoinFee) {
                    finalAmountAtoms = sendingCoinBalanceAtoms;
                } else {
                    finalAmountAtoms = BigNumber.from(sendingCoinBalanceAtoms)
                        .sub(totalFeeSuns)
                        .toString();
                }
            }

            // TODO: [refactoring, critical] remove this after testing
            // eslint-disable-next-line no-console
            console.log(
                "FEE features: ",
                "Ban price",
                bandwidthPriceSuns,
                ". band available",
                availableBandwidth,
                ". Band = (len)",
                requiredBandwidth,
                ". Band to pay for (cnt)",
                bandwidthToPayFor,
                ". Band fee suns",
                bandwidthFee,
                ". Energy price",
                energyPriceSuns,
                ". Energy available",
                availableEnergy,
                ". Energy est",
                requiredEnergy,
                ". Energy exc avail",
                energyToPayFor,
                ". Energy fee suns",
                energyFee,
                ". Total fee suns",
                totalFeeSuns,
                ". Send coin balance",
                sendingCoinBalanceAtoms,
                ". Fee coin balance",
                feeBalanceAtoms,
                ". Is enough =",
                isEnoughBalance,
                ". Final amount",
                finalAmountAtoms
            );

            const txsData = [
                new TxData(finalAmountAtoms, addressToBase58, null, totalFeeSuns, null, null, network, {
                    rate: energyPriceSuns,
                }),
            ];

            /**
             * We don't provide error object for case when the balance is not enough because we want user to see the
             * fee estimation anyway. But we provide two flags about the not enough end zero balance for fee.
             */
            return {
                result: true,
                txsDataArray: txsData,
                isFeeCoinBalanceZero: feeBalanceAtoms === "0",
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
                getCurrentNetwork(coin),
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
            } else if (coin?.protocol === Coin.PROTOCOLS.TRC20) {
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
