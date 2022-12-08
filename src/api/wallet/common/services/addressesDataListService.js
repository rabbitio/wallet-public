import is from "is_js";

import { getSumOfOutputsSendingToAddressByTransactionsList } from "../../btc/lib/transactions/transactions-utils";
import { improveAndRethrow, logError } from "../../../common/utils/errorUtils";
import AddressesService from "../../btc/services/addressesService";
import { satoshiToBtc } from "../../btc/lib/btc-utils";
import InvoicesService from "../../../invoices/services/invoicesService";
import CoinsToFiatRatesService from "./coinsToFiatRatesService";
import { Coins } from "../../coins";

export default class AddressesDataListService {
    static DEFAULT_SORT = "creationDate_desc";

    // TODO: [refactoring, moderate] add constants and enums for sort, filters to avoid using not robust hardcoded values
    /**
     * Retrieves a list of addresses data, adds per address amounts, apply filters, search, sort, paginates and returns
     * final list
     *
     * Use null if one of parameters is not needed.
     *
     // * @param coinTickersList {string[]} - the list of ticker for coins to get addresses for. Note that this is kinda hard
     // *                                   filter for this method to restrict the coins set it works with. But you can also
     // *                                   use the coins filter in the filterBy. This param contains all supported coin
     // *                                   tickers by default
     * @param numberOfAddressesToReturn {number} number of addresses to be returned. If there are less overall
     *                                   addresses count then less than passed number of addresses
     *                                   will be returned. This parameter is mandatory and should be not negative
     *                                   number
     * @param [filterBy] {object} optional - possible values (array of below arrays, can contain 0-3 these filters):
     *                   + [ "amountRange", number_value_from, number_value_to ]
     *                     - use -1 value for numbers to ignore corresponding restriction
     *                     - numbers should be BTC amounts (up to 8 digits after the decimal point, positive)
     *                   + [ "datesRange", date_from, date_to ]
     *                     - use milliseconds number for date values e.g. Date.now() or +new Date(), should be not negative number
     *                     - use -1 value for numbers to ignore corresponding restriction
     *                   + [ "onlyNotEmpty", boolean ]
     *                     - boolean parameter is mandatory and signals whether to return only not empty addresses
     * @param [searchCriteria] {string} optional - any string to search addresses containing it inside one of the fields
     * @param [sortBy] {string} optional - possible values (exactly one of):
     *                 "amount_asc", "amount_desc", "creationDate_asc", "creationDate_desc", "label_asc", "label_desc"
     *
     * @throws validation error if parameters are not valid
     * @returns {Promise<object>} Promise resolving to object of following format: TODO: [refactoring, moderate] use view-model
     *          {
     *              addresses: [ {
     *                      uuid: string,
     *                      address: address string,
     *                      label: string,
     *                      creationTime: number of milliseconds,
     *                      amountBtc: number,
     *                      fiatAmount: number,
     *                      invoiceUuid: optional string,
     *                      invoiceName: optional string,
     *                  }, ... ],
     *              isWholeList: boolean,
     *              minAmount: number, // min amount throughout all addresses
     *              maxAmount: number, // max amount throughout all addresses
     *              wholeListLength: number, // number of all addresses in the wallet
     *              coin: Coin // The coin we calculated addresses list for
     *          }
     *
     */
    // TODO: [ether, critical] Add filtering by coin - add ticker saving to DB
    static async getAddressesDataList(
        // coinTickersList = Coins.getSupportedCoinsTickers(), // TODO: uncomment after actualizing the addresses list API
        numberOfAddressesToReturn,
        filterBy,
        searchCriteria,
        sortBy
    ) {
        try {
            validatedNumberOfAddresses(numberOfAddressesToReturn);
            // validateCoin(coin);
            validateFilterBy(filterBy);
            validateSearchCriteria(searchCriteria);
            validateSort(sortBy);
            const allAddresses = await AddressesService.getAllAddressesData();
            // TODO: [ether, critical] Add amounts calculation for other coins
            // TODO: [ether, critical] When method is called for several coins than use fiat amounts for filtering and sorting
            const withAmounts = await fillAmounts(allAddresses);
            const withFiatAmounts = await addFiatAmounts(withAmounts);
            const selectedOnes = getOnlyFiltered(withFiatAmounts, filterBy);
            const searchedOnes = getOnlySearched(selectedOnes, searchCriteria);
            const withInvoiceUuids = await addUuidsOfInvoices(searchedOnes);
            const sorted = sort(withInvoiceUuids, sortBy);
            const paginated = sorted.slice(0, numberOfAddressesToReturn);
            return {
                addressesData: mapToProperReturnFormat(paginated),
                isWholeList: paginated.length === sorted.length,
                minAmount: getMinAmount(withAmounts),
                maxAmount: getMaxAmount(withAmounts),
                wholeListLength: allAddresses.length,
                // coin: coin,
            };
        } catch (e) {
            improveAndRethrow(e, "getAddressesDataList");
        }
    }
}

// function validateCoin(coin) {
//     if (coin instanceof Coin) {
//         return true;
//     }
//
//     throw new Error("Wrong coin format. coin param should be of Coin type. See the docs.");
// }

function validateFilterBy(filterBy) {
    let isValid = true;

    if (is.not.existy(filterBy)) {
        return;
    }

    if (
        is.not.array(filterBy) ||
        filterBy.filter(filter => is.not.array(filter)).length ||
        filterBy.filter(
            filter => filter[0] !== "amountRange" && filter[0] !== "datesRange" && filter[0] !== "onlyNotEmpty"
        ).length
    ) {
        isValid = false;
    } else {
        const amountRangeFilters = filterBy.filter(filter => filter[0] === "amountRange");
        const datesRangeFilters = filterBy.filter(filter => filter[0] === "datesRange");
        const onlyNotEmptyFilters = filterBy.filter(filter => filter[0] === "onlyNotEmpty");

        if (
            amountRangeFilters.length > 1 ||
            datesRangeFilters.length > 1 ||
            onlyNotEmptyFilters.length > 1 ||
            (amountRangeFilters.length && amountRangeFilters[0].length !== 3) ||
            (datesRangeFilters.length && datesRangeFilters[0].length !== 3) ||
            (onlyNotEmptyFilters.length && onlyNotEmptyFilters[0].length !== 2) ||
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
            (onlyNotEmptyFilters.length && is.not.boolean(onlyNotEmptyFilters[0][1]))
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
        sortBy !== "label_asc" &&
        sortBy !== "label_desc"
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

async function fillAmounts(addressesDataList) {
    const pureAddresses = addressesDataList.map(addressData => addressData.address);
    let transactionsOfAddresses;
    try {
        transactionsOfAddresses = await AddressesService.getConfirmedTransactionsSendingToAddresses(pureAddresses);
    } catch (e) {
        logError(e, "fillAmounts", "Failed to retrieve the list of transactions to calculate the addresses amounts");
    }

    return addressesDataList.map(addressData => {
        const sumSatoshi = transactionsOfAddresses
            ? getSumOfOutputsSendingToAddressByTransactionsList(addressData.address, transactionsOfAddresses)
            : null;

        return { ...addressData, amountBtc: sumSatoshi != null ? satoshiToBtc(sumSatoshi) : null };
    });
}

function getOnlyFiltered(addressesList, filterBy) {
    if (!filterBy || !filterBy.length) {
        return addressesList;
    }

    filterBy.forEach(filterCriteria => {
        if (filterCriteria.length > 1) {
            addressesList = addressesList.filter(addressData => {
                switch (filterCriteria[0]) {
                    case "amountRange":
                        return (
                            filterCriteria[1] !== undefined &&
                            filterCriteria[2] !== undefined &&
                            typeof filterCriteria[1] === "number" &&
                            (filterCriteria[1] === -1 ||
                                addressData.amountBtc == null ||
                                addressData.amountBtc >= filterCriteria[1]) &&
                            typeof filterCriteria[2] === "number" &&
                            (filterCriteria[2] === -1 ||
                                addressData.amountBtc == null ||
                                addressData.amountBtc <= filterCriteria[2])
                        );
                    case "datesRange":
                        return (
                            filterCriteria[1] !== undefined &&
                            filterCriteria[2] !== undefined &&
                            typeof filterCriteria[1] === "number" &&
                            (filterCriteria[1] === -1 || +addressData.creationTime >= filterCriteria[1]) &&
                            typeof filterCriteria[2] === "number" &&
                            (filterCriteria[2] === -1 || +addressData.creationTime <= filterCriteria[2])
                        );
                    case "onlyNotEmpty":
                        return filterCriteria[1] !== true || addressData.amountBtc == null || addressData.amountBtc > 0;
                    default:
                        return true;
                }
            });
        }
    });

    return addressesList;
}

function getOnlySearched(addressesList, searchCriteria) {
    if (!searchCriteria || typeof searchCriteria !== "string" || searchCriteria.trim() === "") {
        return addressesList;
    }

    searchCriteria = searchCriteria.toLowerCase();
    searchCriteria = searchCriteria.trim();

    return addressesList.filter(addressData => {
        const date = new Date(addressData.creationTime);
        const dateTimeString = (
            date.toString() + date.toLocaleDateString("en-US", { weekday: "long", month: "long" })
        ).toLowerCase();

        return (
            ("" + addressData.amountBtc).includes(searchCriteria) ||
            ("" + addressData.fiatAmount).includes(searchCriteria) ||
            (addressData.address && addressData.address.toLowerCase().includes(searchCriteria)) ||
            dateTimeString.includes(searchCriteria) ||
            (addressData.label && addressData.label.toLowerCase().includes(searchCriteria))
        );
    });
}

async function addUuidsOfInvoices(addressesList) {
    const pureAddresses = addressesList.map(addressData => addressData.address);
    const mapping = await InvoicesService.getInvoicesDataByAddressesList(pureAddresses);

    return addressesList.map(addressData => {
        addressData.invoiceUuid = mapping.find(item => item.address === addressData.address).invoiceUuid;
        addressData.invoiceName = mapping.find(item => item.address === addressData.address).invoiceName;
        return addressData;
    });
}

function sort(addressesList, sortBy) {
    if (!sortBy || typeof sortBy !== "string") {
        sortBy = AddressesDataListService.DEFAULT_SORT;
    }

    return addressesList.sort((addressData1, addressData2) => {
        switch (sortBy) {
            case "amount_asc":
                return (addressData1.amountBtc ?? 0) - (addressData2.amountBtc ?? 0);
            case "amount_desc":
                return (addressData2.amountBtc ?? 0) - (addressData1.amountBtc ?? 0);
            case "creationDate_asc":
                return addressData1.creationTime - addressData2.creationTime;
            case "creationDate_desc":
                return addressData2.creationTime - addressData1.creationTime;
            case "label_asc":
                return addressData1.label.localeCompare(addressData2.label);
            case "label_desc":
                return addressData2.label.localeCompare(addressData1.label);
            default:
                throw new Error(`Wrong sorting was passed: ${sortBy}`);
        }
    });
}

function validatedNumberOfAddresses(numberOfAddressesToReturn) {
    if (typeof numberOfAddressesToReturn !== "number" || numberOfAddressesToReturn < 0)
        throw new Error("numberOfAddressesToReturn should be not negative number. ");
}

async function addFiatAmounts(addressesList) {
    const amounts = addressesList.map(addressData => addressData.amountBtc);
    const fiatAmounts = await CoinsToFiatRatesService.convertCoinAmountsToFiat(Coins.COINS.BTC, amounts);
    for (let i = 0; i < addressesList.length; ++i) {
        addressesList[i].fiatAmount = fiatAmounts[i];
    }

    return addressesList;
}

function mapToProperReturnFormat(addressesList) {
    return addressesList.map(addressData => {
        return {
            uuid: addressData.uuid,
            address: addressData.address,
            label: addressData.label,
            creationTime: +addressData.creationTime,
            amountBtc: addressData.amountBtc ?? null,
            fiatAmount: addressData.fiatAmount,
            invoiceUuid: addressData.invoiceUuid,
            invoiceName: addressData.invoiceName,
            // ticker: Coins.COINS.BTC.ticker, // TODO: [ether, critical] Change to taking from addresses data after the implementation
        };
    });
}

function getMinAmount(addressesList) {
    return (
        (addressesList &&
            addressesList.length &&
            addressesList.reduce((min, current) => (+(current.amountBtc ?? 0) < +min.amountBtc ? current : min))
                .amountBtc) ||
        0
    );
}

function getMaxAmount(addressesList) {
    return (
        (addressesList &&
            addressesList.length &&
            addressesList.reduce((max, current) => (+(current.amountBtc ?? 0) > +max.amountBtc ? current : max))
                .amountBtc) ||
        0
    );
}
