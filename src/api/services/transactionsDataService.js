import { decrypt, encrypt, getSaltedHash } from "../adapters/crypto-utils";
import { improveAndRethrow } from "../utils/errorUtils";
import { getDataPassword } from "./internal/storage";
import {
    getTransactionsDataFromServerForCurrentWallet,
    saveTransactionDataToServerForCurrentWallet,
    updateTransactionDataOnServerForCurrentWallet,
} from "../external-apis/backend-api/transactionDataApi";
import PaymentService from "./paymentService";
import { MIN_CONFIRMATIONS } from "../lib/utxos";
import { satoshiToBtc } from "../lib/btc-utils";
import BtcToFiatRatesService from "./btcToFiatRatesService";
import AddressesServiceInternal from "./internal/addressesServiceInternal";
import { transactionsDataProvider } from "./internal/transactionsDataProvider";
import { getExtendedTransactionDetails } from "../lib/transactions/transactions-history";
import FiatPaymentsService from "./internal/FiatPaymentsService";
import { Logger } from "./internal/logs/logger";

export class TransactionsDataService {
    static MIN_CONFIRMATIONS = MIN_CONFIRMATIONS;
    /**
     * Saves given data for transaction id (for current wallet recognized by cookies).
     * Hashes transaction id with salt (data password available only in specific client's browser) to protect from
     * recognition of real transaction id.
     *
     * Also encrypts transaction data with dataPassword. It protects us from stole of data from server.
     *
     * @param transactionId - id of transaction to save data for
     * @param data - transactions data, format: { note: "note_string" }
     * @returns Promise resolving to nothing
     */
    static async saveTransactionData(transactionId, data) {
        const loggerSource = "saveTransactionData";
        try {
            Logger.log(`Start saving tx data for ${transactionId}`, loggerSource);

            const dataPassword = getDataPassword();
            const transactionIdHash = getSaltedHash(transactionId, dataPassword);
            const encryptedNote = encrypt(data.note, dataPassword);
            const transactionsData = { encryptedNote };

            await saveTransactionDataToServerForCurrentWallet(transactionIdHash, transactionsData);

            Logger.log(`Tx data was saved ${transactionId}`, loggerSource);
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Gets encrypted transactions data from server, decrypts it and returns (for current wallet recognized by cookies).
     *
     * @param transactionIds - ids of bitcoin transactions to get from
     * @returns Promise resolving to [ { transactionId: "id_string", note: "note_string" }, ... ]
     */
    static async getTransactionsData(transactionIds) {
        try {
            const dataPassword = getDataPassword();
            const transactionIdHashesMapping = transactionIds.map(transactionId => {
                return { transactionId, transactionIdHash: getSaltedHash(transactionId, dataPassword) };
            });
            const transactionIdHashes = transactionIdHashesMapping.map(entry => entry.transactionIdHash);

            const encryptedTransactionsData = await getTransactionsDataFromServerForCurrentWallet(transactionIdHashes);

            return encryptedTransactionsData.map(dataEntry => {
                const { transactionId } = transactionIdHashesMapping.filter(
                    mapEntry => mapEntry.transactionIdHash === dataEntry.transactionIdHash
                )[0];
                return { transactionId, note: decrypt(dataEntry.encryptedNote, dataPassword) };
            });
        } catch (e) {
            improveAndRethrow(e, "getTransactionsData");
        }
    }

    /**
     * Retrieves transaction details
     *
     * @param txId - id of transaction to get the details for
     * @return Promise resolving to object:
     *     {
     *         txId: string,
     *         creationTime: number of milliseconds,
     *         type: "incoming" or "outgoing",
     *         isSendingAndReceiving: boolean, // true if the transaction sends coins to the wallet itself
     *         status: string,
     *         unconfirmedTime: number or undefined, // undefined is for confirmed transactions
     *         confirmations: number,
     *         explorerLink: string,
     *         address: string, // target for outgoing transaction; receiving for incoming transaction
     *         btcAmount: number,
     *         fiatAmount: number,
     *         btcFee: number,
     *         fiatFee: number,
     *         fiatCurrencyCode: string,
     *         fiatCurrencySymbol: string,
     *         fiatConversionRate: number, // rate at transaction creation time
     *         note: string or undefined, // optional - undefined means there is no note
     *         isRbfAble: boolean, // Whether RBF can be applied for transaction
     *         purchaseData: { paymentId: string, amountWithCurrencyString: string } | null
     *     }
     */
    // TODO: [tests, moderate] Units
    static async getTransactionDetails(txId) {
        const loggerSource = "getTransactionDetails";
        try {
            Logger.log(`Start getting for ${txId}`, loggerSource);

            const [transaction, addresses, txStoredData] = await Promise.all([
                transactionsDataProvider.getTransactionData(txId),
                AddressesServiceInternal.getAllUsedAddresses(),
                TransactionsDataService.getTransactionsData([txId]),
            ]);
            const extendedTransactionData = getExtendedTransactionDetails(transaction, addresses, txStoredData);
            const btcAmount = satoshiToBtc(extendedTransactionData.amount);
            const feeBTCAmount = satoshiToBtc(extendedTransactionData.fees);
            const [
                fiatValues,
                fiatCurrencyData,
                btcUSDRateAtCreationDate,
                usdFiatRate,
                purchasesData,
            ] = await Promise.all([
                PaymentService.convertBtcAmountsToFiat([btcAmount, feeBTCAmount]),
                BtcToFiatRatesService.getCurrentFiatCurrencyData(),
                BtcToFiatRatesService.getRateForSpecificDate(extendedTransactionData.time),
                BtcToFiatRatesService.getUSDtoCurrentSelectedFiatCurrencyRate(),
                FiatPaymentsService.getPurchaseDataForTransactions([extendedTransactionData.txid]),
            ]);

            const unconfirmedTime = Date.now() - transaction.time < 0 ? 0 : Date.now() - transaction.time;
            const result = {
                txId: extendedTransactionData.txid,
                creationTime: extendedTransactionData.time,
                type: extendedTransactionData.type === "in" ? "incoming" : "outgoing",
                isSendingAndReceiving: extendedTransactionData.isSendingAndReceiving,
                status: TransactionsDataService.isIncreasingFee(extendedTransactionData)
                    ? "increasing_fee"
                    : extendedTransactionData.confirmations >= MIN_CONFIRMATIONS
                    ? "confirmed"
                    : extendedTransactionData.confirmations > 0
                    ? "confirming"
                    : "unconfirmed",
                unconfirmedTime: transaction.confirmations < MIN_CONFIRMATIONS ? unconfirmedTime : undefined,
                confirmations: transaction.confirmations,
                explorerLink: PaymentService.getTransactionExternalUrl(txId),
                address: extendedTransactionData.address,
                btcAmount: btcAmount,
                fiatAmount: fiatValues[0],
                btcFee: feeBTCAmount,
                fiatFee: fiatValues[1],
                fiatCurrencyCode: fiatCurrencyData?.currency,
                fiatCurrencySymbol: fiatCurrencyData?.symbol,
                fiatConversionRate: (btcUSDRateAtCreationDate * usdFiatRate || 0).toFixed(2),
                note: extendedTransactionData.description,
                isRbfAble: extendedTransactionData.type === "out" && extendedTransactionData.isRbfAble,
                purchaseData: purchasesData[0].purchaseData,
            };

            Logger.log(`Returning ${JSON.stringify(result)}`, loggerSource);
            return result;
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Updates transaction data on server for current wallet.
     *
     * @param transactionId - id of transaction to update data for
     * @param data - data to be pushed, format: { note: "note_string" }
     * @returns Promise resolving to null if given ids are not found, update result otherwise:
     *   { transactionId: "id_string", note: "note_string" }
     */
    static async updateTransactionData(transactionId, data) {
        const loggerSource = "updateTransactionData";
        try {
            Logger.log(`Start updating for ${transactionId}`, loggerSource);

            const dataPassword = getDataPassword();
            const transactionIdHash = getSaltedHash(transactionId, dataPassword);
            const encryptedNote = encrypt(data.note, dataPassword);
            const transactionData = { encryptedNote };
            const updateResult = await updateTransactionDataOnServerForCurrentWallet(
                transactionIdHash,
                transactionData
            );

            if (updateResult === "not_found") {
                Logger.log(`Tx not found on server ${transactionId}. Returning null`, loggerSource);

                return null;
            }

            Logger.log(`Tx data was updated ${transactionId}`, loggerSource);
            return { transactionId, note: decrypt(updateResult.encryptedNote, dataPassword) };
        } catch (e) {
            improveAndRethrow(e, TransactionsDataService.updateTransactionData);
        }
    }

    /**
     * Checks whether given transaction is replacing one after applying RBF for some another. This check is not robust but
     * is ok in terms of APIs of this app. But note that another usages should be analysed as
     *
     * @param transaction
     * @return {boolean}
     */
    static isIncreasingFee(transaction) {
        // TODO: [bug, low] not all double spending transactions can be treated as "Increasing Fee"
        return (
            transaction.confirmations === 0 &&
            transaction.double_spend === true &&
            !transaction.is_most_probable_double_spend
        );
    }
}
