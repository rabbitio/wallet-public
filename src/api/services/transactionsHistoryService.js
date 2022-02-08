import is from "is_js";

import { MIN_CONFIRMATIONS } from "../lib/utxos";
import { improveAndRethrow } from "../utils/errorUtils";
import { btcToSatoshi, satoshiToBtc } from "../lib/btc-utils";
import PaymentService from "./paymentService";
import { TransactionsDataService } from "./transactionsDataService";
import AddressesServiceInternal from "./internal/addressesServiceInternal";
import { transactionsDataProvider } from "./internal/transactionsDataProvider";
import { getTransactionsHistory } from "../lib/transactions/transactions-history";
import FiatPaymentsService from "./internal/FiatPaymentsService";

export default class TransactionsHistoryService {
    static DEFAULT_SORT = "creationDate_desc";

    /**
     * Returns list of transactions by given sortBy, filterBy, searchCriteria.
     *
     * @param numberOfTransactionsToReturn - number of transactions to be returned. If there are less overall
     *                                       transactions count then less than passed number of transactions
     *                                       will be returned. This parameter is mandatory and should be not negative
     *                                       number or an error will be thrown
     * @param filterBy - optional -possible values (array of below arrays, can contain zero or all 4 these filters):
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
     * @param searchCriteria - optional - any string to search transactions containing it inside one of the fields
     * @param sortBy - optional - possible values (exactly one of):
     *                 "amount_asc", "amount_desc", "creationDate_asc", "creationDate_desc", "unconfirmedFirst"
     * @returns Promise resolving to object of following format:
     *          {
     *              transactions: [ {
     *                      txid: "txid_string"
     *                      type: "incoming" or "outgoing",
     *                      status: "unconfirmed" or "increasing_fee" or "confirming" or "confirmed",
     *                      confirmations: number,
     *                      isConfirmed: boolean,
     *                      creationTime: milliseconds_number,
     *                      amount: number,
     *                      fiatAmount: number,
     *                      fee: number
     *                      fiatFee: number,
     *                      note: "note_string", (if present)
     *                      isRbfAble: boolean,
     *                      purchaseData: { paymentId: string, amountWithCurrencyString: string } | null
     *                  }, ... ],
     *              isWholeList: boolean,
     *              minAmount: number, // min amount throughout all transactions
     *              maxAmount: number, // max amount throughout all transactions
     *              wholeListLength: number // number of all transactions in the wallet
     *          }
     *
     */
    static async getTransactionsList(numberOfTransactionsToReturn, filterBy, searchCriteria, sortBy) {
        try {
            validateNumberOfTransactions(numberOfTransactionsToReturn);
            validateFilterBy(filterBy);
            validateSearchCriteria(searchCriteria);
            validateSort(sortBy);

            const allAddresses = await AddressesServiceInternal.getAllUsedAddresses();
            const allAddressesSingleArray = allAddresses.internal.concat(allAddresses.external);
            const allTransactions = await transactionsDataProvider.getTransactionsByAddresses(allAddressesSingleArray);
            const transactionIds = allTransactions.map(tx => tx.txid);
            const txStoredData = await TransactionsDataService.getTransactionsData(transactionIds);
            const allTxs = getTransactionsHistory(allAddresses, allTransactions, txStoredData);
            const withLabels = await addPurchaseData(allTxs);
            const selectedOnes = getOnlyFiltered(withLabels, filterBy);
            const withFiatAmounts = await addFiatAmounts(selectedOnes);
            const searchedOnes = getOnlySearched(withFiatAmounts, searchCriteria);
            const sorted = sort(searchedOnes, sortBy);
            const paginated = sorted.slice(0, numberOfTransactionsToReturn);

            return {
                transactions: mapToProperReturnFormat(paginated),
                isWholeList: paginated.length === sorted.length,
                minAmount: satoshiToBtc(getMinAmount(allTxs)),
                maxAmount: satoshiToBtc(getMaxAmount(allTxs)),
                wholeListLength: allTxs.length,
            };
        } catch (e) {
            improveAndRethrow(e, TransactionsHistoryService.getTransactionsList);
        }
    }
}

function validateFilterBy(filterBy) {
    let isValid = true;

    if (is.not.existy(filterBy)) {
        return;
    }

    if (
        is.not.array(filterBy) ||
        filterBy.filter(filter => is.not.array(filter)).length ||
        filterBy.filter(
            filter =>
                filter[0] !== "amountRange" &&
                filter[0] !== "datesRange" &&
                filter[0] !== "type" &&
                filter[0] !== "status"
        ).length
    ) {
        isValid = false;
    } else {
        const amountRangeFilters = filterBy.filter(filter => filter[0] === "amountRange");
        const datesRangeFilters = filterBy.filter(filter => filter[0] === "datesRange");
        const typeFilters = filterBy.filter(filter => filter[0] === "type");
        const statusFilters = filterBy.filter(filter => filter[0] === "status");

        if (
            amountRangeFilters.length > 1 ||
            datesRangeFilters.length > 1 ||
            statusFilters.length > 1 ||
            typeFilters.length > 1 ||
            (amountRangeFilters.length && amountRangeFilters[0].length !== 3) ||
            (datesRangeFilters.length && datesRangeFilters[0].length !== 3) ||
            (typeFilters.length && typeFilters[0].length !== 2) ||
            (statusFilters.length && (statusFilters[0].length < 2 || statusFilters[0].length > 5)) ||
            (amountRangeFilters.length &&
                amountRangeFilters[0].length &&
                (is.not.number(amountRangeFilters[0][1]) ||
                    (amountRangeFilters[0][1] < 0 && amountRangeFilters[0][1] !== -1))) ||
            (amountRangeFilters.length &&
                amountRangeFilters[0].length &&
                (is.not.number(amountRangeFilters[0][2]) ||
                    (amountRangeFilters[0][2] < 0 && amountRangeFilters[0][2] !== -1))) ||
            (datesRangeFilters.length &&
                datesRangeFilters[0].length &&
                (is.not.number(datesRangeFilters[0][1]) ||
                    (datesRangeFilters[0][1] < 0 && datesRangeFilters[0][1] !== -1))) ||
            (datesRangeFilters.length &&
                datesRangeFilters[0].length &&
                (is.not.number(datesRangeFilters[0][2]) ||
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
                    ).length)
        ) {
            isValid = false;
        }
    }

    if (!isValid) {
        throw new Error("Format of filterBy is wrong, see docs. ");
    }
}

function validateSort(sortBy) {
    if (is.not.existy(sortBy)) {
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
    if (is.not.existy(searchCriteria)) {
        return;
    }

    if (is.not.string(searchCriteria) || is.empty(searchCriteria)) {
        throw new Error("Format of searchCriteria is wrong, see docs. ");
    }
}

async function addPurchaseData(transactionsList) {
    const purchasesData = await FiatPaymentsService.getPurchaseDataForTransactions(transactionsList.map(tx => tx.txid));

    transactionsList.forEach(tx => {
        const data = purchasesData.find(item => item.txid === tx.txid);
        tx["purchaseData"] = data?.purchaseData;
    });

    return transactionsList;
}

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
                            (filterCriteria[1] === -1 || transaction.amount >= btcToSatoshi(filterCriteria[1])) &&
                            typeof filterCriteria[2] === "number" &&
                            (filterCriteria[2] === -1 || transaction.amount <= btcToSatoshi(filterCriteria[2]))
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
                                TransactionsDataService.isIncreasingFee(transaction)) ||
                            (filterCriteria.find(status => status === "unconfirmed") &&
                                transaction.confirmations < 1 &&
                                !TransactionsDataService.isIncreasingFee(transaction)) ||
                            (filterCriteria.find(status => status === "confirming") &&
                                transaction.confirmations >= 1 &&
                                transaction.confirmations < MIN_CONFIRMATIONS) ||
                            (filterCriteria.find(status => status === "confirmed") &&
                                transaction.confirmations >= MIN_CONFIRMATIONS)
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

        return (
            transaction.txid.toLowerCase().includes(searchCriteria) ||
            ((transaction.type === "in" && "incoming") || "").includes(searchCriteria) ||
            ((transaction.type === "out" && "outgoing") || "").includes(searchCriteria) ||
            ("" + transaction.amount).includes(searchCriteria) ||
            ("" + transaction.fiatAmount).includes(searchCriteria) ||
            ("" + transaction.confirmations).includes(searchCriteria) ||
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
                return tx1.amount - tx2.amount;
            case "amount_desc":
                return tx2.amount - tx1.amount;
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

async function addFiatAmounts(transactionsList) {
    const amounts = transactionsList.map(transaction => satoshiToBtc(transaction.amount));
    const fees = transactionsList.map(transaction => satoshiToBtc(transaction.fees));

    const fiatAmounts = await PaymentService.convertBtcAmountsToFiat(amounts.concat(fees));

    for (let i = 0; i < transactionsList.length; ++i) {
        transactionsList[i].fiatAmount = fiatAmounts[i];
        transactionsList[i].fiatFee = fiatAmounts[i + transactionsList.length];
    }

    return transactionsList;
}

function mapToProperReturnFormat(transactionsList) {
    return transactionsList.map(transaction => {
        return {
            txid: transaction.txid,
            type: transaction.type === "in" ? "incoming" : "outgoing",
            status:
                (TransactionsDataService.isIncreasingFee(transaction) && "increasing_fee") ||
                (transaction.confirmations < 1 && "unconfirmed") ||
                (transaction.confirmations < MIN_CONFIRMATIONS && "confirming") ||
                "confirmed",
            confirmations: transaction.confirmations,
            isConfirmed: transaction.confirmations < MIN_CONFIRMATIONS,
            creationTime: transaction.time,
            amount: satoshiToBtc(transaction.amount),
            fiatAmount: transaction.fiatAmount,
            fee: satoshiToBtc(transaction.fees),
            fiatFee: transaction.fiatFee,
            note: transaction.description,
            isRbfAble: transaction.type === "out" && transaction.isRbfAble,
            purchaseData: transaction.purchaseData,
        };
    });
}

function getMinAmount(transactionsList) {
    return (
        (transactionsList &&
            transactionsList.length &&
            transactionsList.reduce((min, current) => (+current.amount < +min.amount ? current : min)).amount) ||
        0
    );
}

function getMaxAmount(transactionsList) {
    return (
        (transactionsList &&
            transactionsList.length &&
            transactionsList.reduce((max, current) => (+current.amount > +max.amount ? current : max)).amount) ||
        0
    );
}
