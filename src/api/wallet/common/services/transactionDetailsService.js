import { Logger } from "../../../support/services/internal/logs/logger";
import FiatPaymentsService from "../../../purchases/services/FiatPaymentsService";
import CoinsToFiatRatesService from "./coinsToFiatRatesService";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { TransactionsDataService } from "./transactionsDataService";
import { Coins } from "../../coins";
import { Wallets } from "../wallets";
import { TransactionCoinService } from "./internal/transactionCoinService";

export class TransactionDetailsService {
    /**
     * Retrieves transaction details
     *
     * @param txId {string} id of transaction to get the details for
     * @param ticker {string} the ticker for coin
     * @return {Promise<({
     *             txId: string,
     *             creationTime: number, @description of milliseconds
     *             type: string, @description "incoming"|"outgoing"
     *             isSendingAndReceiving: boolean, @description true if the transaction sends coins to the wallet itself
     *             status: string,
     *             unconfirmedTime: number|undefined, @description undefined is for confirmed transactions
     *             confirmations: number,
     *             explorerLink: string,
     *             address: string, @description target for outgoing transaction; receiving for incoming transaction
     *             ticker: string @description coin ticker of the transaction
     *             tickerPrintable: string @description coin ticker of the transaction in printable format
     *             latinName: string,
     *             coinAmount: string,
     *             fiatAmount: string|null,
     *             coinFee: string,
     *             feeCoinTicker: string,
     *             feeCoinTickerPrintable: string,
     *             fiatFee: string,
     *             fiatCurrencyCode: string,
     *             fiatCurrencySymbol: string,
     *             fiatConversionRate: string, @description rate at transaction creation time
     *             note: string|undefined, @description optional - undefined means there is no note
     *             isRbfAble: boolean, @description Whether RBF can be applied for transaction
     *             purchaseData: { paymentId: string, amountWithCurrencyString: string } | null
     *         })>}
     */
    // TODO: [tests, moderate] Units
    static async getTransactionDetails(txId, ticker) {
        const loggerSource = "getTransactionDetails";
        try {
            Logger.log(`Start getting for ${txId} ${ticker}`, loggerSource);

            if (!ticker) {
                ticker = (await TransactionCoinService.getCoinByTransaction(txId))?.ticker;
                Logger.log(`Recognized currency ${txId} ${ticker}`, loggerSource);
            }

            const coin = Coins.getCoinByTicker(ticker);
            const wallet = Wallets.getWalletByCoin(coin);
            const [transaction, txsData] = await Promise.all([
                wallet.getTransactionDetails(txId),
                TransactionsDataService.getTransactionsData([txId]),
            ]);

            if (!transaction) {
                throw new Error("Transaction was not found with id: " + txId);
            }

            const note = txsData.find(item => item.transactionId === txId)?.note;

            const coinAmount = coin.atomsToCoinAmount(transaction.amount);
            const feeCoinAmount = coin.feeCoin.atomsToCoinAmount(transaction.fees);
            let [
                [fiatAmount, fiatFee],
                fiatCurrencyData,
                coinUSDRateAtCreationDate,
                usdFiatRate,
                purchasesData,
            ] = await Promise.all([
                CoinsToFiatRatesService.convertCoinAmountsToFiat(coin, [+coinAmount, +feeCoinAmount]),
                CoinsToFiatRatesService.getCurrentFiatCurrencyData(),
                CoinsToFiatRatesService.getCoinToCurrentFiatCurrencyRateForSpecificDate(coin, transaction.time),
                CoinsToFiatRatesService.getUSDtoCurrentSelectedFiatCurrencyRate(),
                FiatPaymentsService.getPurchaseDataForTransactions([transaction.txid]),
            ]);

            if (coin.doesUseDifferentCoinFee()) {
                fiatFee = (await CoinsToFiatRatesService.convertCoinAmountsToFiat(coin.feeCoin, [+feeCoinAmount]))[0];
            }

            const unconfirmedTime = Date.now() - transaction.time < 0 ? 0 : Date.now() - transaction.time;
            const result = {
                txId: transaction.txid,
                creationTime: transaction.time,
                type: transaction.type === "in" ? "incoming" : "outgoing",
                isSendingAndReceiving: transaction.isSendingAndReceiving,
                status: TransactionDetailsService.isIncreasingFee(transaction)
                    ? "increasing_fee"
                    : transaction.confirmations >= coin.minConfirmations
                    ? "confirmed"
                    : transaction.confirmations > 0
                    ? "confirming"
                    : "unconfirmed",
                unconfirmedTime: transaction.confirmations < coin.minConfirmations ? unconfirmedTime : undefined,
                confirmations: transaction.confirmations,
                explorerLink: coin.composeUrlToTransactionExplorer(txId),
                address: transaction.address,
                ticker: coin.ticker,
                tickerPrintable: coin.tickerPrintable,
                latinName: coin.latinName,
                coinAmount: coinAmount,
                fiatAmount: (fiatAmount != null && fiatAmount.toFixed(fiatCurrencyData.decimalCount)) || null,
                coinFee: feeCoinAmount,
                feeCoinTicker: coin.feeCoin.ticker,
                feeCoinTickerPrintable: coin.feeCoin.tickerPrintable,
                fiatFee: fiatFee.toFixed(fiatCurrencyData.decimalCount),
                fiatCurrencyCode: fiatCurrencyData?.currency,
                fiatCurrencySymbol: fiatCurrencyData?.symbol,
                fiatConversionRate: (coinUSDRateAtCreationDate?.rate * usdFiatRate || 0).toFixed(
                    fiatCurrencyData.decimalCount
                ),
                note: note,
                isRbfAble: transaction.type === "out" && transaction.isRbfAble,
                purchaseData: purchasesData[0]?.purchaseData,
            };

            Logger.log(`Returning ${JSON.stringify(result)}`, loggerSource);
            return result;
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Retrieves the minimum confirmations number required to treat the transaction as confirmed
     *
     * @param ticker - the ticker of coin to get the nu,ber for
     * @return {number} minimum confirmations number
     */
    static minConfirmations(ticker) {
        return Coins.getCoinByTicker(ticker)?.minConfirmations;
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
