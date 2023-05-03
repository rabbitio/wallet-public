import { Logger } from "../../../support/services/internal/logs/logger";
// import FiatPaymentsService from "../../../purchases/services/FiatPaymentsService";
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
     * @param [transactionType=null] {"in"|"out"|null} optional type of transaction
     * @return {Promise<({
     *             txId: string,
     *             creationTime: number, @description of milliseconds
     *             type: string, @description "incoming"|"outgoing"
     *             isSendingAndReceiving: boolean, @description true if the transaction sends coins to the wallet itself
     *             status: string,
     *             unconfirmedTime: (number|undefined), @description undefined is for confirmed transactions
     *             confirmations: number,
     *             explorerLink: string,
     *             address: string, @description target for outgoing transaction; receiving for incoming transaction
     *             ticker: string, @description coin ticker of the transaction
     *             tickerPrintable: string, @description coin ticker of the transaction in printable format
     *             latinName: string,
     *             coinAmount: string,
     *             fiatAmount: (string|null),
     *             coinFee: string,
     *             feeCoinTicker: string,
     *             feeCoinTickerPrintable: string,
     *             fiatFee: string,
     *             fiatCurrencyCode: string,
     *             fiatCurrencySymbol: string,
     *             fiatConversionRate: string, @description rate at transaction creation time
     *             note: string|undefined, @description optional - undefined means there is no note
     *             isRbfAble: boolean, @description Whether RBF can be applied for transaction
     *             purchaseData: ({ paymentId: string, amountWithCurrencyString: string } | null)
     *         }|null)>}
     */
    // TODO: [tests, moderate] Units
    static async getTransactionDetails(txId, ticker, transactionType = null) {
        const loggerSource = "getTransactionDetails";
        try {
            Logger.log(`Start getting for ${txId} ${ticker}`, loggerSource);

            if (!ticker) {
                ticker = (await TransactionCoinService.getCoinByTransaction(txId))?.ticker;
                Logger.log(`Recognized currency ${txId} ${ticker}`, loggerSource);
                if (!ticker) return null;
            }

            const coin = Coins.getCoinByTicker(ticker);
            const wallet = Wallets.getWalletByCoin(coin);
            const typeAdopted = transactionType === "incoming" ? "in" : transactionType === "outgoing" ? "out" : null;
            const [transaction, txsData] = await Promise.all([
                wallet.getTransactionDetails(txId, typeAdopted),
                TransactionsDataService.getTransactionsData([txId]),
            ]);

            if (transaction == null) {
                return null;
            }

            const note = (txsData ?? []).find(item => item.transactionId === txId)?.note;

            const coinAmount = coin.atomsToCoinAmount(transaction.amount);
            const feeCoinAmount = transaction.fees != null ? coin.feeCoin.atomsToCoinAmount(transaction.fees) : null;
            let fiatCurrencyData = CoinsToFiatRatesService.getCurrentFiatCurrencyData();
            let [[fiatAmount, fiatFee], coinToCurrentFiatRateAtCreationDate /*, purchasesData*/] = await Promise.all([
                CoinsToFiatRatesService.convertCoinAmountsToFiat(coin, [+coinAmount, +(feeCoinAmount ?? 0)]),
                CoinsToFiatRatesService.getCoinToCurrentFiatCurrencyRateForSpecificDate(coin, transaction.time),
                // FiatPaymentsService.getPurchaseDataForTransactions([transaction.txid]), // TODO: [feature, moderate] enable if binance connect support this feature task_id=16127916f375490aa6b526675a6c72e4
            ]);

            if (coin.doesUseDifferentCoinFee() && transaction.fees != null) {
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
                    ? "confirming" // TODO: [refactoring, moderate] Since 0.8.0 we no more guarantee the number of confirmations so maybe we should completely remove the "confirming" status logic from whole app. task_id=ad6f057e8a2b4c9ab9addcfda5f172b5
                    : "unconfirmed",
                unconfirmedTime: transaction.confirmations < coin.minConfirmations ? unconfirmedTime : undefined,
                confirmations: transaction.confirmations,
                explorerLink: coin.composeUrlToTransactionExplorer(txId),
                address: transaction.address,
                ticker: coin.ticker,
                tickerPrintable: coin.tickerPrintable,
                latinName: coin.latinName,
                coinAmount: coinAmount,
                fiatAmount: fiatAmount != null ? Number(fiatAmount).toFixed(fiatCurrencyData.decimalCount) : null,
                coinFee: feeCoinAmount ?? null,
                feeCoinTicker: coin.feeCoin.ticker,
                feeCoinTickerPrintable: coin.feeCoin.tickerPrintable,
                fiatFee: fiatFee != null ? Number(fiatFee).toFixed(fiatCurrencyData.decimalCount) : null,
                fiatCurrencyCode: fiatCurrencyData?.currency,
                fiatCurrencySymbol: fiatCurrencyData?.symbol,
                fiatConversionRate:
                    coinToCurrentFiatRateAtCreationDate?.rate != null
                        ? Number(coinToCurrentFiatRateAtCreationDate.rate).toFixed(fiatCurrencyData.decimalCount)
                        : null,
                note: note,
                isRbfAble: transaction.type === "out" && transaction.isRbfAble,
                // purchaseData: purchasesData?.length ? purchasesData[0]?.purchaseData : null, // TODO: [feature, moderate] enable if binance connect support this feature task_id=16127916f375490aa6b526675a6c72e4
                purchaseData: null,
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
        // TODO: [refactoring, moderate] Since 0.8.0 we no more guarantee the number of confirmations so maybe we should completely remove the "confirming" status logic from whole app. task_id=ad6f057e8a2b4c9ab9addcfda5f172b5
        return 1;
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
