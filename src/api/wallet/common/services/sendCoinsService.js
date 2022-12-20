import { BigNumber } from "ethers";
import { Coins } from "../../coins";
import { Wallets } from "../wallets";
import { isAmountDustForAddress } from "../../btc/lib/utxos";
import { improveAndRethrow, logError } from "../../../common/utils/errorUtils";
import { Logger } from "../../../support/services/internal/logs/logger";
import { getCurrentNetwork } from "../../../common/services/internal/storage";
import CoinsToFiatRatesService from "./coinsToFiatRatesService";
import { getDecryptedWalletCredentials } from "../../../auth/services/authService";
import { EventBus, TRANSACTION_PUSHED_EVENT } from "../../../common/adapters/eventbus";
import { TransactionsDataService } from "./transactionsDataService";
import { BalancesService } from "./balancesService";

export class SendCoinsService {
    /**
     * Validates amount to be sent.
     * If isSendAll===false then amount should be not empty, greater than 0, not dust (depending on address type) and not
     * exceeding current coin balance.
     *
     * @param amountCoins {string} amount to be validated in coins (not atoms)
     * @param isSendAll {boolean} whether user aims to send all coins from the wallet
     * @param address {string} address that user aims to send coins to
     * @param [balanceCoinAmount] optional balance to avoid in-place calculation (in coins)
     * @param [coin] {Coin} a coin to check the sending for
     * @return {Promise<{
     *             result: true
     *         }|{
     *             result: false,
     *             errorDescription: string,
     *             howToFix: string
     *         }>}
     */
    static async validateAmountToBeSent(
        amountCoins,
        isSendAll,
        address,
        balanceCoinAmount = null,
        coin = Coins.COINS.BTC
    ) {
        try {
            if (isSendAll) {
                return { result: true }; // Because we set the amount value programmatically
            }

            if (amountCoins == null || amountCoins === "") {
                return {
                    result: false,
                    errorDescription: "A payment amount is required. ",
                    howToFix: "Enter a payment amount.",
                };
            }

            const currentBalance =
                balanceCoinAmount != null ? balanceCoinAmount : await Wallets.getWalletByCoin(coin).calculateBalance();

            const amountAtoms = coin.coinAmountToAtoms(amountCoins);
            // TODO: [feature, moderate, ether] implement for other coins. task_id=0834dc5591994ad4b632d2124f18c1de
            if (coin === Coins.COINS.BTC) {
                const dustCheckResult = isAmountDustForAddress(
                    amountAtoms instanceof BigNumber ? amountAtoms : +amountAtoms,
                    address
                );

                if (dustCheckResult.result) {
                    return {
                        result: false,
                        errorDescription: "The entered amount is less than the minimum possible for sending. ",
                        howToFix: `Enter an amount greater than ${coin.atomsToCoinAmount(dustCheckResult.threshold)} ${
                            coin.ticker
                        }. `,
                    };
                }
            }

            const balanceAtoms = coin.coinAmountToAtoms(currentBalance);
            if (BigNumber.from(amountAtoms).gt(BigNumber.from("" + balanceAtoms))) {
                return {
                    result: false,
                    errorDescription: "The entered amount is greater than the balance you can spend ",
                    howToFix: `Input amount less than ${currentBalance} ${coin.ticker}. `,
                };
            }

            return { result: true };
        } catch (e) {
            improveAndRethrow(e, "validateAmountToBeSent");
        }
    }

    /**
     * Validates address and amount and tries to create transactions for 4 speed options with fake signatures
     * Composes TxData ready for sending for further usage if all is ok.
     *
     * @param address - address to be validated
     * @param coinAmount {string} amount to be validated in coin denomination
     * @param paymentDescription {string} description of payment
     * @param isSendAll {boolean} whether transaction should send all available coins or not
     * @param balanceCoins {string|null} optional balance value to avoid recalculation during the amount validation
     * @param coin {Coin} coin to create the fake ttx for
     * @return {Promise<
     *         {
     *             result: true,
     *             txsDataArray:
     *                 {
     *                     txData: TxData,
     *                     coinFee: string,
     *                     fiatFee: number|null
     *                 }[]
     *                 |
     *                 {
     *                     errorDescription: string,
     *                     howToFix: string
     *                 }[],
     *             isFeeCoinBalanceZero: boolean,
     *             isFeeCoinBalanceNotEnoughForAllOptions: boolean,
     *         }
     *         |
     *         {
     *             result: false,
     *             errorDescription: string,
     *             howToFix: string
     *         }>}
     */
    static async validateParamsAndCreateTransactionsWithFakeSignatures(
        address,
        coinAmount,
        paymentDescription,
        isSendAll,
        balanceCoins,
        coin
    ) {
        const loggerSource = "validateParamsAndCreateTransactionsWithFakeSignatures";
        try {
            Logger.log(`Start. ${coinAmount}->${address}. All: ${isSendAll}. Balance: ${balanceCoins}`, loggerSource);
            const currentNetwork = getCurrentNetwork(coin);
            const wallet = Wallets.getWalletByCoin(coin);
            const addressValidationResult = wallet.isAddressValid(address, currentNetwork);
            const amountValidationResult = await SendCoinsService.validateAmountToBeSent(
                coinAmount,
                isSendAll,
                address,
                balanceCoins,
                coin
            );
            if (amountValidationResult.result && addressValidationResult.result) {
                Logger.log("Address and amount are valid", loggerSource);

                const txsDataResult = await Wallets.getWalletByCoin(coin).createTransactionsWithFakeSignatures(
                    address,
                    coinAmount,
                    isSendAll,
                    currentNetwork,
                    balanceCoins
                );

                if (!txsDataResult.result) {
                    return txsDataResult;
                }

                const fiatFeeAmounts = await CoinsToFiatRatesService.convertCoinAmountsToFiat(
                    coin.feeCoin,
                    txsDataResult.txsDataArray.map(result =>
                        result?.fee ? +coin.feeCoin.atomsToCoinAmount(result.fee) : undefined
                    )
                );

                const withFiatFee = txsDataResult.txsDataArray.map((txData, index) => {
                    if (!txData?.errorDescription) {
                        return {
                            txData: txData,
                            coinFee: txData.fee ? coin.feeCoin.atomsToCoinAmount(txData.fee) : null,
                            coinFeeTrimmed: txData.fee
                                ? coin.feeCoin.atomsToCoinAmountSignificantString(txData.fee)
                                : null,
                            fiatFee: fiatFeeAmounts[index] != null ? fiatFeeAmounts[index] : null,
                        };
                    }

                    return txData;
                });

                Logger.log(
                    `Txs data created:\n${withFiatFee
                        .map(
                            item =>
                                `${
                                    item?.txData
                                        ? `tx:${item?.txData?.toMiniString && item.txData.toMiniString()}`
                                        : `error:${JSON.stringify(item)}`
                                }`
                        )
                        .join("\n")}\n`,
                    loggerSource
                );

                return {
                    result: true,
                    txsDataArray: withFiatFee,
                    isFeeCoinBalanceZero: txsDataResult.isFeeCoinBalanceZero,
                    isFeeCoinBalanceNotEnoughForAllOptions: txsDataResult.isFeeCoinBalanceNotEnoughForAllOptions,
                };
            } else {
                const description = `${addressValidationResult.errorDescription ||
                    ""}${amountValidationResult.errorDescription || ""}`;
                const howToFix = `${addressValidationResult.howToFix || ""}${amountValidationResult.howToFix || ""}`;

                Logger.log(`Validation failed. ${description}. ${howToFix}`, loggerSource);
                return {
                    result: false,
                    errorDescription: description,
                    howToFix: howToFix,
                };
            }
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Creates transaction and broadcasts it to the network. Saves its description if present
     * after successful broadcasting.
     *
     * @param txData {TxData} data to create transaction from
     * @param coin {Coin} coin to create transaction for
     * @param password {string} password for wallet
     * @param [note] {string|null} note to be saved on server for this transaction in case of successful broadcasting
     * @return {Promise<string|{ errorDescription: string, howToFix: string }>} resolving to transaction id of transaction
     *         appeared in the blockchain or to a determined error object
     */
    static async createTransactionByValidTxDataAndBroadcast(txData, coin, password, note) {
        const loggerSource = "createTransactionByValidTxDataAndBroadcast";
        try {
            Logger.log(`Start broadcasting ${txData.amount}->${txData.address}`, loggerSource);

            const wallet = Wallets.getWalletByCoin(coin);
            const { mnemonic, passphrase } = getDecryptedWalletCredentials(password);
            const pushedTxIdOrError = await wallet.createTransactionAndBroadcast(mnemonic, passphrase, txData);

            if (pushedTxIdOrError.errorDescription) {
                Logger.log(`Pushing failed - determined error: ${JSON.stringify(pushedTxIdOrError)}`, loggerSource);
                return {
                    errorDescription: pushedTxIdOrError.errorDescription,
                    howToFix: pushedTxIdOrError.howToFix,
                };
            }

            this._actualizeCaches(wallet, coin, txData, pushedTxIdOrError);

            EventBus.dispatch(TRANSACTION_PUSHED_EVENT, null, pushedTxIdOrError, txData.amount, txData.fee);

            if (typeof note === "string" && note !== "") {
                await TransactionsDataService.saveTransactionData(pushedTxIdOrError, { note });
                Logger.log(`The note was saved. Length: ${note.length}`, loggerSource);
            }

            Logger.log(`The transaction successfully sent and processed: ${pushedTxIdOrError}`, loggerSource);
            return pushedTxIdOrError;
        } catch (e) {
            Logger.log(
                `Failed to broadcast the transaction ${txData.amount}->${txData.address}. ${e.message}`,
                loggerSource
            );
            improveAndRethrow(e, loggerSource);
        }
    }

    static _actualizeCaches(wallet, coin, txData, txId) {
        try {
            wallet.actualizeLocalCachesWithNewTransactionData(coin, txData, txId);
        } catch (e) {
            logError(e, "sendCoinsService._actualizeCaches", "Failed to actualize wallet caches");
        }
        try {
            BalancesService.actualizeCachedBalancesAccordingToJustSentTransaction(coin, txData, txId);
        } catch (e) {
            logError(e, "sendCoinsService._actualizeCaches", "Failed to actualize balances caches");
        }
    }
}
