import bip39 from "bip39";

import { getCurrentNetwork, getWalletId, isSatoshiModeEnabled } from "./internal/storage";
import { btcToSatoshi, satoshiToBtc } from "../lib/btc-utils";
import { getDenomination, satoshiAmountToAnotherDenomination } from "../lib/transactions/transactions-utils";
import {
    getEcPairsToAddressesMapping,
    isAddressValid,
    isP2pkhAddress,
    isP2shAddress,
    isSegWitAddress,
} from "../lib/addresses";
import { getCurrentFeeRate } from "./feeRatesService";
import { improveAndRethrow, logError } from "../utils/errorUtils";
import { getAddresses, isAmountDustForAddress } from "../lib/utxos";
import { TransactionsDataService } from "./transactionsDataService";
import BtcToFiatRatesService from "./btcToFiatRatesService";
import AddressesService from "./addressesService";
import UtxosService from "./internal/utxosService";
import AddressesDataApi from "../external-apis/backend-api/addressesDataApi";
import { mainnet } from "../lib/networks";
import { getDecryptedWalletCredentials } from "./internal/authServiceInternal";
import { EventBus, TRANSACTION_PUSHED_EVENT } from "../adapters/eventbus";
import { transactionsDataProvider } from "./internal/transactionsDataProvider";
import { txDataToTransaction } from "./utils/txDataUtils";
import { buildTransaction } from "../lib/transactions/build-transaction";
import { createFakeSendAllTransaction, createFakeTransaction } from "../lib/transactions/fake-transactions";
import { broadcastTransaction } from "./internal/transactionsBroadcastingService";

export default class PaymentService {
    static BLOCKS_COUNTS_FOR_OPTIONS = [1, 5, 10, 25];
    static STATIC_APPROX_CONFIRMATION_TIME = ["10 min", "50 min", "1.5 h", "3.5 h"];
    static EXPLORER_TESTNET_TX_UI_URL = "https://blockstream.info/testnet/tx/";
    static EXPLORER_LIVENET_TX_UI_URL = "https://blockstream.info/tx/";

    /**
     * Creates transaction and broadcasts it to the network. Saves it's description if present on successful broadcasting.
     *
     * @param txData - txData to create transaction from
     * @param password - password for wallet
     * @param note - note to be saved on server for this transaction in case of successful send
     * @return Promise resolving to txId of broadcasted transaction
     */
    static async createTransactionByValidTxDataAndBroadcast(txData, password, note) {
        try {
            const { mnemonic, passphrase } = getDecryptedWalletCredentials(password);
            const seedHex = bip39.mnemonicToSeedHex(mnemonic, passphrase);
            const indexes = await AddressesDataApi.getAddressesIndexes(getWalletId());
            const mapping = getEcPairsToAddressesMapping(getAddresses(txData.utxos), seedHex, txData.network, indexes);
            const transaction = buildTransaction(
                txData.amount,
                txData.address,
                txData.change,
                txData.changeAddress,
                txData.utxos,
                mapping,
                txData.network
            );

            const transactionId = await broadcastTransaction(transaction, txData.network);

            EventBus.dispatch(TRANSACTION_PUSHED_EVENT, null, transactionId, txData.amount, txData.fee);

            try {
                await transactionsDataProvider.pushNewTransactionToCache(
                    txDataToTransaction(txData, transactionId, 0, null, Date.now())
                );
            } catch (e) {
                logError(
                    e,
                    "createTransactionByValidTxDataAndBroadcast",
                    "Failed to push broadcasted transaction to tx data provider cache"
                );
            }

            if (typeof note === "string" && note !== "") {
                await TransactionsDataService.saveTransactionData(transactionId, { note });
            }

            return transactionId;
        } catch (e) {
            improveAndRethrow(e, "createTransactionByValidTxDataAndBroadcast");
        }
    }

    /**
     * Validates address and amount and tries to create transactions (for all supported blocks count) with fake signatures.
     * Composes TxData ready for sending for further usage if all is ok.
     *
     * @param address - address to be validated
     * @param amount - amount to be validated (BTC)
     * @param paymentDescription - description of payment
     * @param isSendAll - flag - whether transaction should send all available coins or not
     * @param balanceBTC - optional balance value to avoid recalculation during the amount validation
     * @return Promise resolving to object of one of the following formats
     *         {
     *             result: true,
     *             txsDataArray: Array of objects of one of the following formats
     *                 {
     *                     txData: TxData object,
     *                     btcFee: number,
     *                     fiatFee: number, // can be null
     *                 } or
     *                 {
     *                     errorDescription: string,
     *                     howToFix: string,
     *                 }
     *         }
     *         or
     *         {
     *             result: false,
     *             errorDescription: string,
     *             howToFix: string,
     *         }
     */
    static async validateParamsAndCreateTransactionsWithFakeSignatures(
        address,
        amount,
        paymentDescription,
        isSendAll,
        balanceBTC = null
    ) {
        try {
            const currentNetwork = getCurrentNetwork();
            const addressValidationResult = validateTargetAddress(address, currentNetwork);
            const amountValidationResult = await PaymentService.validateAmountToBeSent(
                amount,
                isSendAll,
                address,
                balanceBTC
            );
            if (amountValidationResult.result && addressValidationResult.result) {
                const resolvedPromises = await Promise.all([
                    ...this.BLOCKS_COUNTS_FOR_OPTIONS.map(blocksCount =>
                        getCurrentFeeRate(currentNetwork, blocksCount)
                    ),
                    UtxosService.getAllSpendableUtxos(),
                    !isSendAll ? AddressesService.getCurrentChangeAddress() : null,
                ]);
                const feeRates = resolvedPromises.slice(0, this.BLOCKS_COUNTS_FOR_OPTIONS.length);
                // eslint-disable-next-line no-console
                console.log("OOPPPPTTSS RAATTES - " + JSON.stringify(feeRates));
                const [utxos, changeAddress] = resolvedPromises.slice(resolvedPromises.length - 2);

                let resultsArray = feeRates.map(feeRate => {
                    let txData;
                    if (isSendAll) {
                        txData = createFakeSendAllTransaction(address, feeRate, utxos, currentNetwork);
                    } else {
                        const satoshies = btcToSatoshi(amount);
                        txData = createFakeTransaction(
                            satoshies,
                            address,
                            changeAddress,
                            feeRate,
                            utxos,
                            currentNetwork
                        );
                    }

                    if (!txData?.errorDescription) {
                        return { txData: txData, btcFee: satoshiToBtc(txData.fee) };
                    } else {
                        return { errorDescription: txData.errorDescription, howToFix: txData.howToFix };
                    }
                });

                const fiatFeeAmounts = await PaymentService.convertBtcAmountsToFiat(
                    resultsArray.map(result => result?.btcFee)
                );

                resultsArray = resultsArray.map((result, index) => {
                    if (fiatFeeAmounts[index] != null) {
                        result = { ...result, fiatFee: fiatFeeAmounts[index] };
                    }

                    return result;
                });

                return {
                    result: true,
                    txsDataArray: resultsArray,
                };
            } else {
                return {
                    result: false,
                    errorDescription: `${addressValidationResult.errorDescription ||
                        ""}${amountValidationResult.errorDescription || ""}`,
                    howToFix: `${addressValidationResult.howToFix || ""}${amountValidationResult.howToFix || ""}`,
                };
            }
        } catch (e) {
            improveAndRethrow(e, "validateParamsAndCreateTransactionsWithFakeSignatures");
        }
    }

    /**
     * Validates amount to be sent.
     * If isSendAll===false then amount should be not empty, greater than 0, not dust (depending on address type) and not
     * exceeding current balance.
     *
     * @param amount - amount to be validated (BTC)
     * @param isSendAll - whether user aims to send all coins from the wallet
     * @param address - address that user aims to send coins to
     * @param balanceBTC - optional balance to avoid in-place calculation (BTC)
     * @return Promise resoling to object of following format
     *     {
     *         result: true
     *     }
     *     or
     *     {
     *         result: false,
     *         errorDescription: string,
     *         howToFix: string
     *     }
     */
    // TODO: [tests, moderate] Extract from tests of methods using this one
    static async validateAmountToBeSent(amount, isSendAll, address, balanceBTC = null) {
        try {
            if (isSendAll) {
                return { result: true };
            }

            if (amount == null || amount === "") {
                return {
                    result: false,
                    errorDescription: "A payment amount is required. ",
                    howToFix: "Enter a payment amount.",
                };
            }

            // TODO: [refactoring, low] Remove satoshi mode
            const isSatoshiMode = isSatoshiModeEnabled();
            const denomination = getDenomination(isSatoshiMode);
            !isSatoshiMode && (amount = btcToSatoshi(amount));

            const currentBalance =
                balanceBTC != null ? btcToSatoshi(balanceBTC) : (await UtxosService.calculateBalance())?.spendable;

            const dustCheckResult = isAmountDustForAddress(amount, address);
            if (dustCheckResult.result) {
                return {
                    result: false,
                    errorDescription: "The entered amount is less than the minimum possible for sending. ",
                    howToFix: `Enter an amount greater than ${satoshiAmountToAnotherDenomination(
                        dustCheckResult.threshold,
                        denomination
                    ).toFixed(8)} ${denomination}. `,
                };
            }

            if (amount > currentBalance) {
                return {
                    result: false,
                    errorDescription: "The entered amount is greater than the balance you can spend ",
                    howToFix: `Input amount less than ${satoshiAmountToAnotherDenomination(
                        currentBalance,
                        denomination
                    ).toFixed(8)} ${denomination}. `,
                };
            }

            return { result: true };
        } catch (e) {
            improveAndRethrow(e, "validateAmountToBeSent");
        }
    }

    /**
     * Validates address whether we can send coins to it.
     * Address should be not empty, valid P2PKH, P2SH or bech32 address string.
     *
     * @param address
     * @return Object of one of the following formats
     *     {
     *         result: false,
     *         errorDescription: String,
     *         howToFix: String,
     *     }
     *     or
     *     {
     *         result: true,
     *         address: String
     *     }
     */
    static isAddressValidForSending(address) {
        try {
            return validateTargetAddress(address, getCurrentNetwork());
        } catch (e) {
            improveAndRethrow(e, "isAddressValidForSending");
        }
    }

    /**
     * Composes URL for page of transaction with given Id in external explorer
     * @param txId - id of tx to compose URL for
     * @returns URL string
     */
    static getTransactionExternalUrl(txId) {
        return (
            (getCurrentNetwork()?.key === mainnet.key
                ? PaymentService.EXPLORER_LIVENET_TX_UI_URL
                : PaymentService.EXPLORER_TESTNET_TX_UI_URL) + txId
        );
    }

    /**
     * Converts array of BTC amounts to array of amount in current fiat currency.
     * If no rate is retrieved or invalid rate is retrieved returns array of nulls.
     *
     * @param btcAmountsArray - array of amounts in BTC to be converted
     * @param fiatDigitsAfterComma - pass if you want to get more digits after comma for fiat values, default is 2
     * @returns Promise resolving to fiat amounts array
     */
    static async convertBtcAmountsToFiat(btcAmountsArray, fiatDigitsAfterComma = 2) {
        try {
            let btcToFiatRate = await BtcToFiatRatesService.getBtcToCurrentSelectedFiatCurrencyRate();
            if (!btcToFiatRate || btcToFiatRate.rate == null) {
                return btcAmountsArray.map(amount => null);
            }

            return btcAmountsArray.map(amount => {
                if (amount == null) {
                    return null;
                }
                return +(amount * btcToFiatRate.rate).toFixed(fiatDigitsAfterComma);
            });
        } catch (e) {
            improveAndRethrow(e, "convertBtcAmountsToFiat");
        }
    }
}

// TODO: [tests, moderate] Extract from tests of methods using this one
function validateTargetAddress(address, currentNetwork) {
    if (!address) {
        return {
            result: false,
            errorDescription: "An address is required. ",
            howToFix: "Please enter your address. ",
        };
    }

    if (isAddressValid(address, currentNetwork)) {
        if (isP2pkhAddress(address) || isP2shAddress(address) || isSegWitAddress(address)) {
            return {
                result: true,
                address: address,
            };
        } else {
            return {
                result: false,
                errorDescription: "The address has an unsupported format. ",
                howToFix: "Enter your address using one of the following formats: P2PKH, P2SH, or bech32. ",
            };
        }
    }

    return {
        result: false,
        errorDescription: "The entered address is not valid. ",
        howToFix: "Please check the address and try again. ",
    };
}
