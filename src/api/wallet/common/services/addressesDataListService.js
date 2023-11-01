import { getSumOfOutputsSendingToAddressByTransactionsList } from "../../btc/lib/transactions/transactions-utils";
import { improveAndRethrow, logError } from "../../../common/utils/errorUtils";
import AddressesService from "../../btc/services/addressesService";
import CoinsToFiatRatesService from "./coinsToFiatRatesService";
import { Coins } from "../../coins";

export default class AddressesDataListService {
    static DEFAULT_SORT = "creationDate_desc";

    // TODO: [refactoring, moderate] remove this service. task_id=2dfd7adefe9d48acbe0ecb6f83fd68f7
    /**
     * Retrieves a list of addresses data, adds per address amounts, apply filters, search, sort, paginates and returns
     * final list
     *
     * Use null if one of parameters is not needed.
     *
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
     * @returns {Promise<object>} Promise resolving to object of following format:
     *          {
     *              addresses: [ {
     *                      uuid: string,
     *                      address: address string,
     *                      label: string,
     *                      creationTime: number of milliseconds,
     *                      amountBtc: number,
     *                      fiatAmount: number,
     *                  }, ... ],
     *              isWholeList: boolean,
     *              minAmount: number, // min amount throughout all addresses
     *              maxAmount: number, // max amount throughout all addresses
     *              wholeListLength: number, // number of all addresses in the wallet
     *              coin: Coin // The coin we calculated addresses list for
     *          }
     */
    static async getAddressesDataList(numberOfAddressesToReturn, filterBy, searchCriteria, sortBy) {
        try {
            validatedNumberOfAddresses(numberOfAddressesToReturn);
            validateFilterBy(filterBy);
            validateSearchCriteria(searchCriteria);
            validateSort(sortBy);
            const allAddresses = await AddressesService.getAllAddressesData();
            const withAmounts = await fillAmounts(allAddresses);
            const withFiatAmounts = await addFiatAmounts(withAmounts);
            const selectedOnes = getOnlyFiltered(withFiatAmounts, filterBy);
            const searchedOnes = getOnlySearched(selectedOnes, searchCriteria);
            const sorted = sort(searchedOnes, sortBy);
            const paginated = sorted.slice(0, numberOfAddressesToReturn);
            return {
                addressesData: mapToProperReturnFormat(paginated),
                isWholeList: paginated.length === sorted.length,
                minAmount: getMinAmount(withFiatAmounts),
                maxAmount: getMaxAmount(withFiatAmounts),
                wholeListLength: allAddresses.length,
            };
        } catch (e) {
            improveAndRethrow(e, "getAddressesDataList");
        }
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
            (onlyNotEmptyFilters.length && typeof onlyNotEmptyFilters[0][1] !== "boolean")
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
        sortBy !== "label_asc" &&
        sortBy !== "label_desc"
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

        return {
            ...addressData,
            amountBtc: sumSatoshi != null ? Number(Coins.COINS.BTC.atomsToCoinAmount("" + sumSatoshi)) : null,
        };
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
                                addressData.fiatAmount == null ||
                                addressData.fiatAmount >= filterCriteria[1]) &&
                            typeof filterCriteria[2] === "number" &&
                            (filterCriteria[2] === -1 ||
                                addressData.fiatAmount == null ||
                                addressData.fiatAmount <= filterCriteria[2])
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
        };
    });
}

function getMinAmount(addressesList) {
    return (
        (addressesList &&
            addressesList.length &&
            addressesList.reduce((min, current) => (+(current.fiatAmount ?? 0) < +min.fiatAmount ? current : min))
                .fiatAmount) ||
        0
    );
}

function getMaxAmount(addressesList) {
    return (
        (addressesList &&
            addressesList.length &&
            addressesList.reduce((max, current) => (+(current.fiatAmount ?? 0) > +max.fiatAmount ? current : max))
                .fiatAmount) ||
        0
    );
}
