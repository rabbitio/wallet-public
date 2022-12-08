import is from "is_js";

import { improveAndRethrow } from "../../common/utils/errorUtils";
import { getDataPassword, getWalletId } from "../../common/services/internal/storage";
import { btcToSatoshi } from "../../wallet/btc/lib/btc-utils";
import { getSumOfOutputsSendingToAddressByTransactionsList } from "../../wallet/btc/lib/transactions/transactions-utils";
import InvoicesApi from "../backend-api/invoicesApi";
import AddressesService from "../../wallet/btc/services/addressesService";
import { Logger } from "../../support/services/internal/logs/logger";
import { Invoice } from "../models/inovice";
import { Coins } from "../../wallet/coins";
import CoinsToFiatRatesService from "../../wallet/common/services/coinsToFiatRatesService";

export default class InvoicesService {
    static DEFAULT_SORT = "creationDate_desc";
    static _invoicesCache = [];

    /**
     * Validates invoice data before creation.
     *
     * @param name - invoice name to be validated
     * @param amount - invoice amount to be validated
     * @returns Object { result: true } if data is valid or { result: false, errorDescription: string, howToFix: string } if
     *          there are validation errors
     */
    // TODO: [refactoring, critical] extract to separate service
    static validateInvoiceData(name, amount) {
        const result = { result: true };
        let error = "";
        let howToFix = "";

        Logger.log(`Validating invoice data: name=${name}, amount=${amount}`, "validateInvoiceData");

        if (typeof name !== "string" || name === "") {
            error = "An invoice name is required. ";
            howToFix = "Enter an invoice name. ";
        }

        if (!amount || amount < 0 || amount > Coins.COINS.BTC.maxValue) {
            error += `The invoice amount should fall in the range of 0 - ${Coins.COINS.BTC.maxValue} BTC.`;
            howToFix += "Please try entering the amount again. ";
        }

        if (error) {
            result["errorDescription"] = error;
            result["howToFix"] = howToFix;
            result.result = false;
        }

        return result;
    }

    /**
     * Creates new Invoice on base of given params and saves it on server (encrypted)
     *
     * @param name - name of new invoice
     * @param amountBtc - amount in BTC of new invoice
     * @param address - address of new invoice
     * @param message - optional message
     * @param label - optional label
     * @returns Promise resolving to uuid of created invoice
     */
    static async createInvoice(name, amountBtc, address, message = "", label = "") {
        const loggerSource = "createInvoice";
        try {
            Logger.log(`Saving invoice ${name}|${amountBtc}|${address}|${message}|${label}`, loggerSource);

            const invoice = new Invoice(name, amountBtc, address);
            message && (invoice.message = message);
            label && (invoice.label = label);
            invoice.recalculatePaymentUrl();

            await InvoicesApi.saveInvoice(getWalletId(), invoice.uuid, invoice.serializeAndEncrypt(getDataPassword()));

            Logger.log(`Invoice saved ${JSON.stringify(invoice)}`, loggerSource);

            return invoice.uuid;
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    // TODO: [refactoring, moderate] add constants and enums for sort, filters to avoid using not robust hardcoded values
    /**
     * Retrieves a list of invoices from server, decrypts, apply filter, search, sort, paginate and returns final list.
     *
     // * @param coinTickersList {string[]} - the list of ticker for coins to get invoices for. Note that this is kinda hard
     // *                                   filter for this method to restrict the coins set it works with. But you can also
     // *                                   use the coins filter in the filterBy. This param contains all supported coin
     // *                                   tickers by default
     * @param numberOfInvoicesToReturn {number} number of invoices to be returned. If there are less overall
     *                                   invoices count then less than passed number of invoices
     *                                   will be returned. This parameter is mandatory and should be not negative
     *                                   number or an error will be thrown
     * @param [filterBy] {object} optional -possible values (array of below arrays, can contain zero or all 3 these filters):
     *                   + [ "amountRange", number_value_from, number_value_to ]
     *                     - use -1 value for numbers to ignore corresponding restriction
     *                     - numbers should be BTC amounts (up to 8 digits after the decimal point)
     *                   + [ "datesRange", date_from, date_to ]
     *                     - use milliseconds number for date values e.g. Date.now() or +new Date()
     *                     - use -1 value for numbers to ignore corresponding restriction
     *                   + [ "status", "status_string" ]
     *                     - where status_string is one of "pending", "paid"
     * @param [searchCriteria] {string} optional - any string to search invoice containing it inside one of the fields
     * @param [sortBy] {string} optional - possible values (exactly one of):
     *                 "amount_asc", "amount_desc", "creationDate_asc", "creationDate_desc", "pendingFirst"
     * @returns {Promise<object>} Promise resolving to object of following format: TODO: [refactoring, moderate] use view-model
     *          {
     *              invoices: [ {
     *                      uuid: string,
     *                      name: string,
     *                      creationTime: number of milliseconds,
     *                      amountBtc: number,
     *                      fiatAmount: number,
     *                      status: "paid" or "pending",
     *                      address: address string,
     *                      label: string,
     *                      message: string,
     *                      paymentUrl: string
     *                  }, ... ],
     *              isWholeList: boolean,
     *              minAmount: number, // min amount throughout all invoices
     *              maxAmount: number, // max amount throughout all invoices
     *              wholeListLength: number // number of all invoices in the wallet
     *          }
     *
     */
    // TODO: [ether, critical] add support for other coins
    static async getInvoicesList(
        // coinTickersList = Coins.getSupportedCoinsTickers(), // TODO: uncomment after actualizing the addresses list API
        numberOfInvoicesToReturn,
        filterBy,
        searchCriteria,
        sortBy
    ) {
        const loggerSource = "getInvoicesList";
        try {
            validateNumberOfInvoices(numberOfInvoicesToReturn);
            validateFilterBy(filterBy);
            validateSearchCriteria(searchCriteria);
            validateSort(sortBy);

            const allInvoices = await createListOfInvoicesOnBaseOfServerData();

            Logger.log(`Retrieved all ${allInvoices.length} invoices`, loggerSource);

            const withFiatAmounts = await addFiatAmounts(allInvoices);
            InvoicesService._invoicesCache = withFiatAmounts;
            const selectedOnes = getOnlyFiltered(withFiatAmounts, filterBy);
            const searchedOnes = getOnlySearched(selectedOnes, searchCriteria);
            const sorted = sort(searchedOnes, sortBy);
            const paginated = sorted.slice(0, numberOfInvoicesToReturn);

            Logger.log(`Returning ${paginated.length} invoices`, loggerSource);

            return {
                invoices: mapToProperReturnFormat(paginated),
                isWholeList: paginated.length === sorted.length,
                minAmount: getMinAmount(allInvoices),
                maxAmount: getMaxAmount(allInvoices),
                wholeListLength: allInvoices.length,
            };
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * maps given addresses to uuids of corresponding invoices.
     * If there is no invoice for some address maps it to null.
     *
     * @param addressesList - array of addresses to map to invoices
     * @returns Promise resolving to:
     *          [{ address: "address_string", invoiceUuid: "uuid_string" or null }, ... ]
     * @throws Error if addressesList is not array
     */
    static async getInvoicesDataByAddressesList(addressesList) {
        try {
            if (is.not.array(addressesList)) {
                throw new Error("Addresses list should be an array, see docs. ");
            }
            const encryptedInvoicesFromServer = await InvoicesApi.getInvoicesList(getWalletId());
            const dataPassword = getDataPassword();
            const invoices = encryptedInvoicesFromServer.map(dataItem =>
                Invoice.decryptAndDeserialize(dataItem, dataPassword)
            );

            return addressesList.map(address => {
                const invoiceOfAddress = invoices.find(invoice => invoice.address === address);
                return {
                    address,
                    invoiceUuid: (invoiceOfAddress && invoiceOfAddress.uuid) || null,
                    invoiceName: (invoiceOfAddress && invoiceOfAddress.name) || null,
                };
            });
        } catch (e) {
            improveAndRethrow(e, "getInvoicesDataByAddressesList");
        }
    }

    /**
     * Deletes invoice with given uuid from server.
     *
     * @param invoiceUuid - uuid string of invoice to be removed
     */
    static async deleteInvoice(invoiceUuid) {
        const loggerSource = "deleteInvoice";
        try {
            Logger.log(`Deleting invoice ${invoiceUuid}`, loggerSource);

            await InvoicesApi.deleteInvoices(getWalletId(), [invoiceUuid]);
            this._invoicesCache = this._invoicesCache.filter(invoice => invoice.uuid !== invoiceUuid);

            Logger.log(`Invoice was removed ${invoiceUuid}`, loggerSource);
        } catch (e) {
            improveAndRethrow(e, loggerSource, `Failed to remove invoice ${invoiceUuid}`);
        }
    }

    /**
     * Retrieves details for specific invoice from cache or from server (if there is no such entry in cache).
     *
     * @param invoiceUuid - uuid of specific invoice to get details for
     * @returns Promise resolving to invoice data or null if not fond with such uuid
     *          {
     *              uuid: string,
     *              name: string,
     *              creationTime: number of milliseconds,
     *              amountBtc: number,
     *              fiatAmount: number,
     *              status: "paid" or "pending",
     *              address: address string,
     *              label: string,
     *              message: string,
     *              paymentUrl: string
     *          }
     */
    static async getInvoiceDetails(invoiceUuid) {
        const loggerSource = "getInvoiceDetails";
        Logger.log(`Getting invoice details ${invoiceUuid}`, loggerSource);
        if (typeof invoiceUuid !== "string" || invoiceUuid === "") {
            throw new Error("Invoice uuid should be not empty string. ");
        }

        try {
            let invoice = this._invoicesCache.find(invoice => invoice.uuid === invoiceUuid);
            if (!invoice) {
                Logger.log("No invoice in cache, retrieving", loggerSource);
                const invoices = await createListOfInvoicesOnBaseOfServerData([invoiceUuid]);
                if (invoices.length) {
                    invoice = invoices[0];
                    this._invoicesCache.push(invoice);
                } else {
                    invoice = null;
                }
            } else {
                const transactionsOfInvoices = await AddressesService.getConfirmedTransactionsSendingToAddresses([
                    invoice.address,
                ]);
                invoice.isPaid = isInvoicePaid(invoice, transactionsOfInvoices);
            }

            if (invoice) {
                Logger.log("Invoice retrieved, adding info", loggerSource);
                const withFiatAmount = (await addFiatAmounts([invoice]))[0];
                const inProperFormat = mapToProperReturnFormat([withFiatAmount])[0];

                Logger.log(`Returning invoice ${JSON.stringify(inProperFormat)}`, loggerSource);
                return inProperFormat;
            }

            Logger.log("Returning null", loggerSource);
            return null;
        } catch (e) {
            improveAndRethrow(e, loggerSource);
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
        filterBy.filter(filter => filter[0] !== "amountRange" && filter[0] !== "datesRange" && filter[0] !== "status")
            .length
    ) {
        isValid = false;
    } else {
        const amountRangeFilters = filterBy.filter(filter => filter[0] === "amountRange");
        const datesRangeFilters = filterBy.filter(filter => filter[0] === "datesRange");
        const statusFilters = filterBy.filter(filter => filter[0] === "status");

        if (
            amountRangeFilters.length > 1 ||
            datesRangeFilters.length > 1 ||
            statusFilters.length > 1 ||
            (amountRangeFilters.length && amountRangeFilters[0].length !== 3) ||
            (datesRangeFilters.length && datesRangeFilters[0].length !== 3) ||
            (statusFilters.length && statusFilters[0].length !== 2) ||
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
            (statusFilters.length && statusFilters[0][1] !== "pending" && statusFilters[0][1] !== "paid")
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
        sortBy !== "pendingFirst"
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

async function createListOfInvoicesOnBaseOfServerData(uuids = []) {
    const encryptedInvoicesFromServer = await InvoicesApi.getInvoicesList(getWalletId(), uuids);
    const invoicesListFromServer = encryptedInvoicesFromServer.map(encryptedInvoiceData =>
        Invoice.decryptAndDeserialize(encryptedInvoiceData, getDataPassword())
    );

    return await fillInvoicesStatuses(invoicesListFromServer);
}

async function fillInvoicesStatuses(invoices) {
    const addresses = invoices.map(invoice => invoice.address);
    const transactionsOfInvoices = await AddressesService.getConfirmedTransactionsSendingToAddresses(addresses);
    invoices.forEach(invoice => (invoice.isPaid = isInvoicePaid(invoice, transactionsOfInvoices)));

    return invoices;
}

function isInvoicePaid(invoice, transactionsList) {
    const paidSumSatoshis = getSumOfOutputsSendingToAddressByTransactionsList(invoice.address, transactionsList);

    return paidSumSatoshis >= btcToSatoshi(invoice.amountBtc);
}

function getOnlyFiltered(invoicesList, filterBy) {
    if (!filterBy || !filterBy.length) {
        return invoicesList;
    }

    filterBy.forEach(filterCriteria => {
        if (filterCriteria.length > 1) {
            invoicesList = invoicesList.filter(invoice => {
                switch (filterCriteria[0]) {
                    case "amountRange":
                        return (
                            filterCriteria[1] !== undefined &&
                            filterCriteria[2] !== undefined &&
                            typeof filterCriteria[1] === "number" &&
                            (filterCriteria[1] === -1 || invoice.amountBtc >= filterCriteria[1]) &&
                            typeof filterCriteria[2] === "number" &&
                            (filterCriteria[2] === -1 || invoice.amountBtc <= filterCriteria[2])
                        );
                    case "datesRange":
                        return (
                            filterCriteria[1] !== undefined &&
                            filterCriteria[2] !== undefined &&
                            typeof filterCriteria[1] === "number" &&
                            (filterCriteria[1] === -1 || +invoice.creationTime >= filterCriteria[1]) &&
                            typeof filterCriteria[2] === "number" &&
                            (filterCriteria[2] === -1 || +invoice.creationTime <= filterCriteria[2])
                        );
                    case "status":
                        return (
                            (filterCriteria[1] === "paid" && invoice.isPaid) ||
                            (filterCriteria[1] === "pending" && !invoice.isPaid)
                        );
                    default:
                        return true;
                }
            });
        }
    });

    return invoicesList;
}

function getOnlySearched(invoicesList, searchCriteria) {
    if (!searchCriteria || typeof searchCriteria !== "string" || searchCriteria.trim() === "") {
        return invoicesList;
    }

    searchCriteria = searchCriteria.toLowerCase();
    searchCriteria = searchCriteria.trim();

    return invoicesList.filter(invoice => {
        const date = new Date(invoice.creationTime);
        const dateTimeString = (
            date.toString() + date.toLocaleDateString("en-US", { weekday: "long", month: "long" })
        ).toLowerCase();

        return (
            invoice.name.toLowerCase().includes(searchCriteria) ||
            ("" + invoice.amountBtc).includes(searchCriteria) ||
            ("" + invoice.fiatAmount).includes(searchCriteria) ||
            (invoice.address && invoice.address.toLowerCase().includes(searchCriteria)) ||
            ((invoice.isPaid && "paid") || "pending").includes(searchCriteria) ||
            dateTimeString.includes(searchCriteria) ||
            (invoice.label && invoice.label.toLowerCase().includes(searchCriteria)) ||
            (invoice.message && invoice.message.toLowerCase().includes(searchCriteria)) ||
            (invoice.paymentUrl && invoice.paymentUrl.toLowerCase().includes(searchCriteria))
        );
    });
}

function sort(invoicesList, sortBy) {
    if (!sortBy || typeof sortBy !== "string") {
        sortBy = InvoicesService.DEFAULT_SORT;
    }

    return invoicesList.sort((invoice1, invoice2) => {
        switch (sortBy) {
            case "amount_asc":
                return invoice1.amountBtc - invoice2.amountBtc;
            case "amount_desc":
                return invoice2.amountBtc - invoice1.amountBtc;
            case "creationDate_asc":
                return invoice1.creationTime - invoice2.creationTime;
            case "creationDate_desc":
                return invoice2.creationTime - invoice1.creationTime;
            case "pendingFirst":
                return invoice1.isPaid - invoice2.isPaid;
            default:
                throw new Error(`Wrong sorting was passed: ${sortBy}`);
        }
    });
}

function validateNumberOfInvoices(numberOfInvoicesToReturn) {
    if (typeof numberOfInvoicesToReturn !== "number" || numberOfInvoicesToReturn < 0)
        throw new Error("Number of invoices should be not negative number. ");
}

async function addFiatAmounts(invoicesList) {
    const amounts = invoicesList.map(invoice => invoice.amountBtc);

    const fiatAmounts = await CoinsToFiatRatesService.convertCoinAmountsToFiat(Coins.COINS.BTC, amounts);

    for (let i = 0; i < invoicesList.length; ++i) {
        invoicesList[i].fiatAmount = fiatAmounts[i];
    }

    return invoicesList;
}

function mapToProperReturnFormat(invoicesList) {
    return invoicesList.map(invoice => {
        return {
            uuid: invoice.uuid,
            name: invoice.name,
            creationTime: +invoice.creationTime,
            amountBtc: invoice.amountBtc,
            fiatAmount: invoice.fiatAmount,
            status: invoice.isPaid ? "paid" : "pending",
            address: invoice.address,
            label: invoice.label,
            message: invoice.message,
            paymentUrl: invoice.paymentUrl,
        };
    });
}

function getMinAmount(invoicesList) {
    return (
        (invoicesList &&
            invoicesList.length &&
            invoicesList.reduce((min, current) => (+current.amountBtc < +min.amountBtc ? current : min)).amountBtc) ||
        0
    );
}

function getMaxAmount(invoicesList) {
    return (
        (invoicesList &&
            invoicesList.length &&
            invoicesList.reduce((max, current) => (+current.amountBtc > +max.amountBtc ? current : max)).amountBtc) ||
        0
    );
}
