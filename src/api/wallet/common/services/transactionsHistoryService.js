import { BigNumber } from "bignumber.js";

import { improveAndRethrow, Logger, CacheAndConcurrentRequestsResolver } from "@rabbitio/ui-kit";

import { TransactionsDataService } from "./internal/transactionsDataService.js";
// import FiatPaymentsService from "../../../purchases/services/FiatPaymentsService.js";
import { TransactionDetailsService } from "./transactionDetailsService.js";
import CoinsToFiatRatesService from "./coinsToFiatRatesService.js";
import { Coins } from "../../coins.js";
import { Wallets } from "../wallets.js";
import {
    BALANCE_CHANGED_EXTERNALLY_EVENT,
    FIAT_CURRENCY_CHANGED_EVENT,
    INCREASE_FEE_IS_FINISHED_EVENT,
    NEW_NOT_LOCAL_TRANSACTIONS_EVENT,
    TRANSACTION_PUSHED_EVENT,
} from "../../../common/adapters/eventbus.js";
import { SMALL_TTL_FOR_CACHE_L2_MS } from "../../../common/utils/ttlConstants.js";
import { cache } from "../../../common/utils/cache.js";

export default class TransactionsHistoryService {
    // TODO: [tests, moderate] add units for caching for existing tests
    static _cacheAndRequestsResolver = new CacheAndConcurrentRequestsResolver(
        "transactionsHistoryService",
        cache,
        SMALL_TTL_FOR_CACHE_L2_MS,
        false
    );
    static _cachePrefix = "1ad60a23-40f7-47c5-a574-8e87c3dc71ca";
    static _cacheKey = (tickers, numberOfTransactionsToReturn, filterBy, search, sortBy) =>
        `${this._cachePrefix}_${JSON.stringify(tickers ?? "")}${JSON.stringify(filterBy ?? "")}${JSON.stringify(
            sortBy ?? ""
        )}${JSON.stringify(search ?? "")}_${numberOfTransactionsToReturn}`;

    static invalidateCaches(tickers, numberOfTransactionsToReturn, filterBy, search, sortBy) {
        if (tickers) {
            this._cacheAndRequestsResolver.invalidate(
                this._cacheKey(tickers, numberOfTransactionsToReturn, filterBy, search, sortBy)
            );
        } else {
            this._cacheAndRequestsResolver.invalidateContaining(this._cachePrefix);
        }
    }

    static eventsListForcingToClearCache = [
        FIAT_CURRENCY_CHANGED_EVENT,
        NEW_NOT_LOCAL_TRANSACTIONS_EVENT,
        BALANCE_CHANGED_EXTERNALLY_EVENT,
        TRANSACTION_PUSHED_EVENT,
        INCREASE_FEE_IS_FINISHED_EVENT,
    ];

    static DEFAULT_SORT = "creationDate_desc";

    // TODO: [refactoring, moderate] add constants and enums for sort, filters to avoid using not robust hardcoded values
    // TODO: [refactoring, critical] separate this module into several as it is too long and its unit tests are difficult to read and enhance
    // TODO: [refactoring, critical] use models for parameters (e.g. TransactionsFilterQuery) and for returning result
    /**
     * Returns list of transactions by given sortBy, filterBy, searchCriteria for the given coins list.
     *
     * @param coinTickersList {string[]} - the list of ticker for coins to get transactions for. Note that this is kinda hard
     *                                   filter for this method to restrict the coins set it works with. But you can also
     *                                   use the coins filter in the filterBy
     * @param numberOfTransactionsToReturn {number} number of transactions to be returned. If there are less overall
     *                                       transactions count then less than passed number of transactions
     *                                       will be returned. This parameter is mandatory and should be not negative
     *                                       number or an error will be thrown
     * @param [filterBy] {object} optional -possible values (array of below arrays, can contain zero or all 4 these filters):
     *                   + [ "amountRange", number_value_from, number_value_to ]
     *                     - use -1 value for numbers to ignore corresponding restriction
     *                     - numbers should be BTC amounts (up to 8 digits after the decimal point)
     *                   + [ "datesRange", date_from, date_to ]
     *                     - use milliseconds number for date values e.g. Date.now() or +new Date()
     *                     - use -1 value for numbers to ignore corresponding restriction
     *                   + [ "type", "type_string" ]
     *                     - where type_string is one of "incoming", "outgoing"
     *                   + [ "status", "status_string_1", "status_string_2_optional", "status_string_3_optional", "status_string_4_optional" ]
     *                     - where status_string is one of "unconfirmed", "increasing_fee", "confirming", "confirmed"
     *                   + [ "currency", "TICKER1", "TICKER2", ... , "TICKER_N" ]
     *                     - where TICKER is one of enabled coin tickers (Coins.getEnabledCoinsTickers())
     * @param [searchCriteria] {string} optional - any string to search transactions containing it inside one of the fields
     * @param [sortBy] {string} optional - possible values (exactly one of):
     *                 "amount_asc", "amount_desc", "creationDate_asc", "creationDate_desc", "unconfirmedFirst"
     * @returns {Promise<{
     *              transactions: {
     *                  txid: string,
     *                  type: ("incoming"|"outgoing"),
     *                  status: ("unconfirmed"|"increasing_fee"|"confirming"|"confirmed"),
     *                  confirmations: number,
     *                  creationTime: number,
     *                  amountCoins: string,
     *                  fiatAmount: (number|string),
     *                  feeCoins: (string|null),
     *                  fiatFee: number,
     *                  note: string|null,
     *                  isRbfAble: boolean,
     *                  purchaseData: ({ paymentId: string, amountWithCurrencyString: string }|null),
     *                  coin: Coin
     *              }[],
     *              isWholeList: boolean,
     *              minAmount: number,
     *              maxAmount: number,
     *              wholeListLength: number
     *          }
     *      >}
     *      where amount is in coin (not atoms) and min and max amounts are fiat values
     *
     */
    static async getTransactionsList(coinTickersList, numberOfTransactionsToReturn, filterBy, searchCriteria, sortBy) {
        const loggerSource = "getTransactionsList";
        let cacheKey;
        let waitingResult;
        try {
            validateTickersList(coinTickersList);
            validateNumberOfTransactions(numberOfTransactionsToReturn);
            validateFilterBy(filterBy);
            validateSearchCriteria(searchCriteria);
            validateSort(sortBy);

            const filteredCoins = getRequestedCoinsList(coinTickersList, filterBy);

            cacheKey = this._cacheKey(coinTickersList, numberOfTransactionsToReturn, filterBy, searchCriteria, sortBy);
            waitingResult = await this._cacheAndRequestsResolver.getCachedOrWaitForCachedOrAcquireLock(cacheKey);
            if (!waitingResult.canStartDataRetrieval) {
                return waitingResult?.cachedData;
            }

            const promises = filteredCoins.map(coin => Wallets.getWalletByCoin(coin).getTransactionsList());
            const allTransactions = (await Promise.all(promises)).flat();

            await addNotesIgnoringErrors(allTransactions);

            Logger.log(
                `Getting. Coins: ${JSON.stringify(coinTickersList)}, all txs: ${allTransactions.length}`,
                loggerSource
            );

            // TODO: [feature, moderate] enable if binance connect support this feature task_id=16127916f375490aa6b526675a6c72e4
            // const withLabels = await addPurchaseData(allTransactions);
            const withFiatAmounts = await addFiatAmounts(filteredCoins, allTransactions);
            const selectedOnes = getOnlyFiltered(withFiatAmounts, filterBy);
            const searchedOnes = getOnlySearched(selectedOnes, searchCriteria);
            const sorted = sort(searchedOnes, sortBy);
            const paginated = sorted.slice(0, numberOfTransactionsToReturn);

            const result = {
                transactions: mapToProperReturnFormat(paginated),
                isWholeList: paginated.length === sorted.length,
                minAmount: getMinAmount(allTransactions),
                maxAmount: getMaxAmount(allTransactions),
                // If we filter by coin we don't know what is the actual transactions count for the whole coins list, so we just add 1 to signal the whole list is large
                wholeListLength:
                    filteredCoins.length === coinTickersList.length
                        ? allTransactions.length
                        : allTransactions.length + 1,
            };

            this._cacheAndRequestsResolver.saveCachedData(cacheKey, waitingResult?.lockId, result);

            return result;
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        } finally {
            cacheKey != null && this._cacheAndRequestsResolver.releaseLock(cacheKey, waitingResult?.lockId);
        }
    }
}

function validateTickersList(coinTickersList) {
    if (
        !Array.isArray(coinTickersList) ||
        coinTickersList.find(ticker => Coins.getEnabledCoinsTickers().indexOf(ticker) < 0)
    ) {
        throw new Error("Tickers list is not valid: " + JSON.stringify(coinTickersList));
    }
}

function validateFilterBy(filterBy) {
    if (filterBy == null) {
        return;
    }
    let isValid = true;

    if (
        !Array.isArray(filterBy) ||
        filterBy.filter(filter => !Array.isArray(filter)).length ||
        filterBy.filter(
            filter =>
                filter[0] !== "amountRange" &&
                filter[0] !== "datesRange" &&
                filter[0] !== "type" &&
                filter[0] !== "status" &&
                filter[0] !== "currency"
        ).length
    ) {
        isValid = false;
    } else {
        const amountRangeFilters = filterBy.filter(filter => filter[0] === "amountRange");
        const datesRangeFilters = filterBy.filter(filter => filter[0] === "datesRange");
        const typeFilters = filterBy.filter(filter => filter[0] === "type");
        const statusFilters = filterBy.filter(filter => filter[0] === "status");
        const currencyFilters = filterBy.filter(filter => filter[0] === "currency");

        if (
            amountRangeFilters.length > 1 ||
            datesRangeFilters.length > 1 ||
            statusFilters.length > 1 ||
            typeFilters.length > 1 ||
            currencyFilters.length > 1 ||
            (amountRangeFilters.length && amountRangeFilters[0].length !== 3) ||
            (datesRangeFilters.length && datesRangeFilters[0].length !== 3) ||
            (typeFilters.length && typeFilters[0].length !== 2) ||
            (statusFilters.length && (statusFilters[0].length < 2 || statusFilters[0].length > 5)) ||
            (currencyFilters.length &&
                (currencyFilters[0].length < 2 || currencyFilters[0].length > Coins.getEnabledCoinsTickers().length)) ||
            (amountRangeFilters.length &&
                amountRangeFilters[0].length &&
                (typeof amountRangeFilters[0][1] !== "number" ||
                    (amountRangeFilters[0][1] < 0 && amountRangeFilters[0][1] !== -1))) ||
            (amountRangeFilters.length &&
                amountRangeFilters[0].length &&
                (typeof amountRangeFilters[0][2] !== "number" ||
                    (amountRangeFilters[0][2] < 0 && amountRangeFilters[0][2] !== -1))) ||
            (datesRangeFilters.length &&
                datesRangeFilters[0].length &&
                (typeof datesRangeFilters[0][1] !== "number" ||
                    (datesRangeFilters[0][1] < 0 && datesRangeFilters[0][1] !== -1))) ||
            (datesRangeFilters.length &&
                datesRangeFilters[0].length &&
                (typeof datesRangeFilters[0][2] !== "number" ||
                    (datesRangeFilters[0][2] < 0 && datesRangeFilters[0][2] !== -1))) ||
            (typeFilters.length && typeFilters[0][1] !== "incoming" && typeFilters[0][1] !== "outgoing") ||
            (statusFilters.length &&
                statusFilters[0]
                    .slice(1)
                    .filter(
                        status =>
                            status !== "unconfirmed" &&
                            status !== "increasing_fee" &&
                            status !== "confirming" &&
                            status !== "confirmed"
                    ).length) ||
            (currencyFilters.length &&
                currencyFilters[0]
                    .slice(1)
                    .filter(tickerFilter => !Coins.getEnabledCoinsTickers().find(ticker => ticker === tickerFilter))
                    .length)
        ) {
            isValid = false;
        }
    }

    if (!isValid) {
        throw new Error("Format of filterBy is wrong, see docs. ");
    }
}

function validateSort(sortBy) {
    if (sortBy == null) {
        return;
    }

    if (
        sortBy !== "amount_asc" &&
        sortBy !== "amount_desc" &&
        sortBy !== "creationDate_asc" &&
        sortBy !== "creationDate_desc" &&
        sortBy !== "unconfirmedFirst"
    ) {
        throw new Error("Format of sortBy is wrong, see docs. ");
    }
}

function validateSearchCriteria(searchCriteria) {
    if (searchCriteria == null) {
        return;
    }

    if (typeof searchCriteria !== "string" || searchCriteria === "") {
        throw new Error("Format of searchCriteria is wrong, see docs. ");
    }
}

function getRequestedCoinsList(coinsTickersList, filterBy) {
    let currencyFilter = (filterBy || []).find(filter => filter[0] === "currency");
    if (currencyFilter && currencyFilter.length > 1) {
        coinsTickersList = coinsTickersList.filter(ticker => currencyFilter.find(item => item === ticker));
    }

    return coinsTickersList.map(ticker => Coins.getCoinByTicker(ticker));
}

async function addNotesIgnoringErrors(allTransactions) {
    try {
        const transactionIds = allTransactions.map(tx => tx.txid);
        const txStoredData = await TransactionsDataService.getTransactionsData(transactionIds);
        txStoredData.forEach(txData => {
            const matchedTx = allTransactions.find(item => item.txid === txData.transactionId);
            matchedTx && (matchedTx.description = txData.note);
        });
    } catch (e) {
        Logger.log("Failed to add notes to transactions: " + e.message, "addNotesIgnoringErrors");
    }
}

// async function addPurchaseData(transactionsList) {
//     const purchasesData = await FiatPaymentsService.getPurchaseDataForTransactions(transactionsList.map(tx => tx.txid));
//
//     transactionsList.forEach(tx => {
//         const data = purchasesData.find(item => item.txid === tx.txid);
//         tx["purchaseData"] = data?.purchaseData;
//     });
//
//     return transactionsList;
// }

function getOnlyFiltered(transactionsList, filterBy) {
    if (!filterBy || !filterBy.length) {
        return transactionsList;
    }

    filterBy.forEach(filterCriteria => {
        if (filterCriteria.length > 1) {
            transactionsList = transactionsList.filter(transaction => {
                switch (filterCriteria[0]) {
                    case "amountRange":
                        return (
                            filterCriteria[1] !== undefined &&
                            filterCriteria[2] !== undefined &&
                            typeof filterCriteria[1] === "number" &&
                            (filterCriteria[1] === -1 || BigNumber(transaction.fiatAmount).gte(filterCriteria[1])) &&
                            typeof filterCriteria[2] === "number" &&
                            (filterCriteria[2] === -1 || BigNumber(transaction.fiatAmount).lte(filterCriteria[2]))
                        );
                    case "datesRange":
                        return (
                            filterCriteria[1] !== undefined &&
                            filterCriteria[2] !== undefined &&
                            typeof filterCriteria[1] === "number" &&
                            (filterCriteria[1] === -1 || +transaction.time >= filterCriteria[1]) &&
                            typeof filterCriteria[2] === "number" &&
                            (filterCriteria[2] === -1 || +transaction.time <= filterCriteria[2])
                        );
                    case "type":
                        return (
                            (filterCriteria[1] === "incoming" && transaction.type === "in") ||
                            (filterCriteria[1] === "outgoing" && transaction.type === "out")
                        );
                    case "status":
                        return (
                            (filterCriteria.find(status => status === "increasing_fee") &&
                                TransactionDetailsService.isIncreasingFee(transaction)) ||
                            (filterCriteria.find(status => status === "unconfirmed") &&
                                transaction.confirmations < 1 &&
                                !TransactionDetailsService.isIncreasingFee(transaction)) ||
                            (filterCriteria.find(status => status === "confirming") &&
                                transaction.confirmations >= 1 &&
                                transaction.confirmations <
                                    Coins.getCoinByTicker(transaction.ticker)?.minConfirmations) ||
                            (filterCriteria.find(status => status === "confirmed") &&
                                transaction.confirmations >=
                                    Coins.getCoinByTicker(transaction.ticker)?.minConfirmations)
                        );
                    default:
                        return true;
                }
            });
        }
    });

    return transactionsList;
}

function getOnlySearched(transactionsList, searchCriteria) {
    if (!searchCriteria || typeof searchCriteria !== "string" || searchCriteria.trim() === "") {
        return transactionsList;
    }

    searchCriteria = searchCriteria.toLowerCase();
    searchCriteria = searchCriteria.trim();

    return transactionsList.filter(transaction => {
        const date = new Date(transaction.time);
        const dateTimeString = (
            date.toString() + date.toLocaleDateString("en-US", { weekday: "long", month: "long" })
        ).toLowerCase();

        const latinName = (Coins?.getCoinByTicker(transaction.ticker)?.latinName ?? "").toLowerCase();
        return (
            transaction.txid.toLowerCase().includes(searchCriteria) ||
            ((transaction.type === "in" && "incoming") || "").includes(searchCriteria) ||
            ((transaction.type === "out" && "outgoing") || "").includes(searchCriteria) ||
            ("" + transaction.amount).includes(searchCriteria) ||
            ("" + transaction.fiatAmount).includes(searchCriteria) ||
            ("" + transaction.confirmations).includes(searchCriteria) ||
            ("" + transaction.ticker.toLowerCase()).includes(searchCriteria) ||
            latinName.includes(searchCriteria) ||
            dateTimeString.includes(searchCriteria) ||
            (transaction.address && transaction.address.toLowerCase().includes(searchCriteria)) ||
            ("" + transaction.fees).includes(searchCriteria) ||
            ("" + transaction.fiatFee).includes(searchCriteria) ||
            (transaction.description && transaction.description.toLowerCase().includes(searchCriteria)) ||
            (transaction.labels && transaction.labels.find(label => label.toLowerCase().includes(searchCriteria)))
        );
    });
}

function sort(transactionsList, sortBy) {
    if (!sortBy || typeof sortBy !== "string") {
        sortBy = TransactionsHistoryService.DEFAULT_SORT;
    }

    return transactionsList.sort((tx1, tx2) => {
        switch (sortBy) {
            case "amount_asc":
                return tx1.fiatAmount - tx2.fiatAmount;
            case "amount_desc":
                return tx2.fiatAmount - tx1.fiatAmount;
            case "creationDate_asc":
                return tx1.time - tx2.time;
            case "creationDate_desc":
                return tx2.time - tx1.time;
            case "unconfirmedFirst":
                return tx1.confirmations - tx2.confirmations;
            default:
                throw new Error(`Wrong sorting passed: ${sortBy}`);
        }
    });
}

function validateNumberOfTransactions(numberOfTransactionsToReturn) {
    if (typeof numberOfTransactionsToReturn !== "number" || numberOfTransactionsToReturn < 0)
        throw new Error("Number of transactions should be not negative number. ");
}

async function addFiatAmounts(coins, transactionsList) {
    try {
        for (let i = 0; i < coins.length; ++i) {
            const coinTransactions = transactionsList.filter(tx => coins[i].ticker === tx.ticker);
            const amounts = coinTransactions.map(tx =>
                tx.amount != null ? coins[i].atomsToCoinAmount(tx.amount) : null
            );
            const fees = coinTransactions.map(tx =>
                tx.fees != null ? coins[i].feeCoin.atomsToCoinAmount(tx.fees) : null
            );

            const fiatAmounts = await CoinsToFiatRatesService.convertCoinAmountsToFiat(coins[i], amounts.concat(fees));

            for (let j = 0; j < coinTransactions.length; ++j) {
                coinTransactions[j].fiatAmount = fiatAmounts[j];
                coinTransactions[j].fiatFee = fiatAmounts[j + coinTransactions.length];
            }
        }

        return transactionsList;
    } catch (e) {
        improveAndRethrow(e, "addFiatAmounts");
    }
}

function mapToProperReturnFormat(transactionsList) {
    return transactionsList.map(transaction => {
        const coin = Coins.getCoinByTicker(transaction.ticker);
        const amountCoinsString = transaction.amount != null ? coin.atomsToCoinAmount(transaction.amount) : null;
        return {
            txid: transaction.txid,
            // TODO: [refactoring, moderate] use type constant
            type: transaction.type === "in" ? "incoming" : "outgoing",
            status:
                (TransactionDetailsService.isIncreasingFee(transaction) && "increasing_fee") ||
                (transaction.confirmations < 1 && "unconfirmed") ||
                (transaction.confirmations < coin.minConfirmations && "confirming") ||
                "confirmed",
            confirmations: transaction.confirmations,
            creationTime: transaction.time,
            amountCoins: amountCoinsString,
            fiatAmount: transaction.fiatAmount,
            feeCoins: transaction.fees != null ? coin.feeCoin.atomsToCoinAmount(transaction.fees) : null,
            fiatFee: transaction.fiatFee,
            note: transaction.description,
            // TODO: [refactoring, low] use per-coin isRBFAble?
            isRbfAble: transaction.type === "out" && !!transaction.isRbfAble,
            purchaseData: transaction.purchaseData ?? null,
            coin: coin,
            address: transaction.address,
        };
    });
}

function getMinAmount(transactionsList) {
    return (
        (transactionsList?.length &&
            transactionsList.reduce((min, current) =>
                BigNumber(current.fiatAmount).lt(min.fiatAmount) ? current : min
            ).fiatAmount) ||
        0
    );
}

function getMaxAmount(transactionsList) {
    return (
        (transactionsList?.length &&
            transactionsList.reduce((max, current) =>
                BigNumber(current.fiatAmount).gt(max.fiatAmount) ? current : max
            ).fiatAmount) ||
        0
    );
}
