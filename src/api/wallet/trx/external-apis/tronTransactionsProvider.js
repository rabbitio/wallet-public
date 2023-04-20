import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { getCurrentNetwork } from "../../../common/services/internal/storage";
import { Coins } from "../../coins";
import { TransactionsHistoryItem } from "../../common/models/transactionsHistoryItem";
import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import {
    actualizeCacheWithNewTransactionSentFromAddress,
    mergeTwoArraysByItemIdFieldName,
} from "../../common/utils/cacheActualizationUtils";
import { TRONGR_PR_K } from "../../../../properties";
import { tronUtils } from "../adapters/tronUtils";
import { provideFirstSeenTime } from "../../common/external-apis/utils/firstSeenTimeHolder";
import { computeConfirmationsCountByTimestamp } from "../lib/blocks";
import { ApiGroups } from "../../../common/external-apis/apiGroups";

/**
 * WARNING: this provider returns internal transactions in non-recognizable format, and we don't process them,
 * so it should be used with lower priority or removed at all if we find better one.
 */
class TronscanTronTransactionsProvider extends ExternalApiProvider {
    constructor() {
        const maxPageLength = 50; // Discovered by experiments
        super(
            "https://apilist.tronscan.org/api/transaction?sort=-timestamp&count=true",
            "get",
            15000,
            ApiGroups.TRONSCAN,
            {},
            maxPageLength
        );
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const network = getCurrentNetwork(Coins.COINS.TRX);
            if (network !== Coins.COINS.TRX.mainnet) {
                throw new Error("Deliberate fail to stop processing for tronscan as it doesn't support testnet");
            }
            const address = params[0];
            const offset = params[1];
            return `&limit=${this.maxPageLength}&start=${offset ?? 0}&address=${address}`;
        } catch (e) {
            improveAndRethrow(e, "tronscanTronTransactionsProvider.composeQueryString");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            const data = response?.data?.data;
            const myAddress = params[0];
            if (!Array.isArray(data)) throw new Error("Wrong data format for tronscan transaction retrieval");
            return data
                .map(t => {
                    if (t?.contractType !== 1) {
                        // Means the transaction is not a transfer of trx
                        return [];
                    }
                    const addressTo = (t?.toAddressList ?? [""])[0];
                    const isSendingAndReceiving = t.ownerAddress && t.ownerAddress === addressTo;
                    const type = addressTo === myAddress ? "in" : "out";
                    const amount = t.amount;
                    const confirmations = t.timestamp ? computeConfirmationsCountByTimestamp(t.timestamp) : 0;
                    // NOTE: we don't handle TRC20 transactions here because tronscan provides them using not clear format to recognize the contract
                    //       left this code for possible future solution
                    //
                    // if (t?.contractType > 1) {
                    //     // This transaction is some contract transaction
                    //     const contractAddress = (t?.trigger_info?.contract_address ?? "").toLowerCase();
                    //     const token = Coins.getSupportedCoinsList().find(
                    //         c => (c.tokenAddress ?? "").toLowerCase() === contractAddress
                    //     );
                    //     if (!token || !tronUtils.isTrc20TransferMethodId(t?.trigger_info?.methodId)) {
                    //         // Looks like this transaction is some not supported token/contract execution or method is not supported
                    //         return [];
                    //     }
                    //     coin = token;
                    //     addressTo = (t?.trigger_info?.parameter?._to ?? "").toLowerCase();
                    //     type = addressTo === params[0] ? "in" : "out";
                    //     amount = t?.trigger_info?.parameter?._value;
                    // }
                    const tx = exactType =>
                        new TransactionsHistoryItem(
                            t.hash,
                            Coins.COINS.TRX.ticker,
                            Coins.COINS.TRX.tickerPrintable,
                            exactType,
                            amount,
                            confirmations,
                            t.timestamp ?? provideFirstSeenTime(t.hash),
                            addressTo,
                            t?.cost?.fee ?? null,
                            t,
                            false,
                            isSendingAndReceiving,
                            false,
                            false
                        );
                    return isSendingAndReceiving ? [tx("in"), tx("out")] : tx(type);
                })
                .flat();
        } catch (e) {
            improveAndRethrow(e, "tronscanTronTransactionsProvider.getDataByResponse");
        }
    }

    doesSupportPagination() {
        return true;
    }

    changeQueryParametersForPageNumber(params, previousResponse, pageNumber, subRequestIndex = 0) {
        const address = params[0];
        const offset = pageNumber * this.maxPageLength;
        return [address, offset];
    }

    checkWhetherResponseIsForLastPage(previousResponse, currentResponse, currentPageNumber, subRequestIndex = 0) {
        return (currentResponse?.data?.data?.length ?? 0) < this.maxPageLength;
    }
}

class TrongridTronTransactionsProvider extends ExternalApiProvider {
    constructor() {
        super("", "get", 15000, ApiGroups.TRONGRID, { "TRON-PRO-API-KEY": TRONGR_PR_K }, 200);
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const address = params[0];
            const nextPageLink = params[1];
            if (nextPageLink) {
                // Means this is call for second or more page, and we already added the link to next page provided by the tronscan
                return nextPageLink;
            }
            const network = getCurrentNetwork(Coins.COINS.TRX);
            return `https://${
                network === Coins.COINS.TRX.mainnet ? "api" : "nile"
            }.trongrid.io/v1/accounts/${address}/transactions?limit=${this.maxPageLength}`;
        } catch (e) {
            improveAndRethrow(e, "trongridTronTransactionsProvider.composeQueryString");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            const data = response?.data?.data;
            if (!Array.isArray(data))
                throw new Error("Wrong format of data for trongrid transactions for tron: " + data);
            const myAddress = params[0];
            return data
                .map(t => {
                    const contractInfo = (t?.raw_data?.contract ?? [])[0] ?? {};
                    const trongridContractType = contractInfo.type ?? null;
                    const fee = "" + ((t.ret ?? [])[0]?.fee ?? 0);
                    const confirmations = t.block_timestamp
                        ? computeConfirmationsCountByTimestamp(t.block_timestamp)
                        : 0;
                    const timestamp = t.block_timestamp ?? provideFirstSeenTime(t.txID);
                    const tx = (id, exactType, exactAmount, exactAddressTo, exactIsSendingAndReceiving) =>
                        new TransactionsHistoryItem(
                            id,
                            Coins.COINS.TRX.ticker,
                            Coins.COINS.TRX.tickerPrintable,
                            exactType,
                            exactAmount,
                            confirmations,
                            timestamp,
                            exactAddressTo,
                            fee,
                            t,
                            false,
                            exactIsSendingAndReceiving,
                            false,
                            false
                        );
                    if (t.internal_tx_id && t.to_address && t.from_address && t?.data?.call_value?._ != null) {
                        /* This is processing for TRONGRID's API inconsistency.
                         * They provide each transaction in the list using standard format but for some txs related to address via
                         * internal transactions they don't provide the same format and return only weird cut data item.
                         * The same time some of these weird items just duplicate the full transaction with internal
                         * transactions list located just in the same list somewhere nearby.
                         * TRONSCAN doesn't show such a ghost transactions in the list of transactions related to address.
                         * But you can access this transaction by ID in their UI and see the list of internal transactions
                         * and the weird item from the trongrid API list is shown there.
                         *
                         * Note that this weird item has not complete data needed to fill the transaction, but we still
                         * use it because the trongrid is the only API providing the internal transactions with recognizable
                         * TRX transfers.
                         *
                         * Example: check this tx
                         *     "440140edbd1e9be5a0a78605018d5803b2388e080227337b435a826b127cd5d8"
                         * and this address transactions
                         *     "TUPToFqFQNdoK685XcMYFZzXBbCyUyRzPD"
                         */
                        const weird_id = t.tx_id;
                        const isDuplicatedWeirdItem = data.find(item => item.txID === weird_id);
                        if (isDuplicatedWeirdItem) {
                            /* We avoid processing of weird item if we see that there is full transaction item in the
                             * retrieved data list. This is just handling of TRONGRID API inconsistency.
                             */
                            return [];
                        }
                        const weird_amount = "" + t.data.call_value._; // TRONGRID uses "_" as TRX identifier
                        const weird_addressToBase58 = tronUtils.hexAddressToBase58check(t.to_address);
                        const weird_addressFromBase58 = tronUtils.hexAddressToBase58check(t.from_address);
                        if (weird_addressToBase58 !== myAddress && weird_addressFromBase58 !== myAddress) {
                            // Means this transaction is not related to the inspecting address
                            return [];
                        }
                        const weird_isSendingAndReceiving = weird_addressFromBase58 === weird_addressToBase58;
                        const weird_type = weird_addressToBase58 === myAddress ? "in" : "out";
                        return weird_isSendingAndReceiving
                            ? [
                                  tx(weird_id, "in", weird_amount, weird_addressToBase58, true),
                                  tx(weird_id, "out", weird_amount, weird_addressToBase58, true),
                              ]
                            : tx(
                                  weird_id,
                                  weird_type,
                                  weird_amount,
                                  weird_addressToBase58,
                                  weird_isSendingAndReceiving
                              );
                    } else if (trongridContractType === "TransferContract") {
                        const addressFrom = tronUtils.hexAddressToBase58check(
                            contractInfo?.parameter?.value?.owner_address ?? ""
                        );
                        const addressTo = tronUtils.hexAddressToBase58check(
                            t.raw_data.contract[0].parameter.value.to_address ?? ""
                        );
                        const isSendingAndReceiving = addressTo === addressFrom;
                        const amount = "" + t.raw_data.contract[0].parameter.value.amount;
                        const ordinaryTrxTransfer = type => tx(t.txID, type, amount, addressTo, isSendingAndReceiving);
                        return isSendingAndReceiving
                            ? [ordinaryTrxTransfer("in"), ordinaryTrxTransfer("out")]
                            : [ordinaryTrxTransfer(addressFrom === myAddress ? "out" : "in")];
                        // NOTE: for now we don't use this provider to get trc20 transactions as it behaves the weird way.
                        //       See details here: https://stackoverflow.com/questions/75254597/not-clear-difference-between-the-tron-trc20-transactions
                        //
                        // } else if (trongridContractType === "TriggerSmartContract") {
                        //     const contractAddressHex = t.raw_data.contract[0].parameter.value.contract_address;
                        //     const contractAddressBase58 = tronUtils.hexAddressToBase58check(contractAddressHex ?? "");
                        //
                        //     // eslint-disable-next-line no-console
                        //     console.log("ADDRS CHECKING TRC20: " + contractAddressBase58, JSON.stringify(t));
                        //
                        //     coin = Coins.getSupportedCoinsList().find(c => c.tokenAddress === contractAddressBase58);
                        //     if (!coin) {
                        //         // Looks like we don't support the figured out contract, so skipping this transaction
                        //         return [];
                        //     }
                        //     const txData = t.raw_data.contract[0].parameter.value.data ?? "";
                        //     if (!tronUtils.isTrc20TransferMethodId(txData.slice(0, 8))) {
                        //         // We expect only trc20 contracts here and only transfer method, so skipping otherwise
                        //         return [];
                        //     }
                        //     const txContractParams = tronUtils.decodeTrc20TransferParams(txData);
                        //     addressTo = txContractParams[0];
                        //     isSendingAndReceiving = addressTo === addressFrom;
                        //     amount = "" + txContractParams;
                    } else if (Array.isArray(t.internal_transactions)) {
                        return t.internal_transactions
                            .filter(internalTx => internalTx?.data?.call_value?._) // Filtering ones transferring TRX
                            .map(internalTx => {
                                if (internalTx.to_address) {
                                    const internalId = t.txID; // We set parent tx id for internal transactions as their own id cannot be requested via UI or API
                                    const internalToAddress = tronUtils.hexAddressToBase58check(internalTx.to_address);
                                    const internalFromAddress = tronUtils.hexAddressToBase58check(
                                        internalTx.from_address
                                    );
                                    if (internalToAddress === myAddress || internalFromAddress === myAddress) {
                                        // Proceeding only if this internal transaction is related to one of our addresses
                                        const internalTxAmount = internalTx.data.call_value._;
                                        const internalTxType = myAddress === internalToAddress ? "in" : "out";
                                        const internalIsSendingAndReceiving = internalToAddress === internalFromAddress;
                                        return internalIsSendingAndReceiving
                                            ? [
                                                  tx(internalId, "in", internalTxAmount, internalToAddress, true),
                                                  tx(internalId, "out", internalTxAmount, internalToAddress, true),
                                              ]
                                            : tx(
                                                  internalId,
                                                  internalTxType,
                                                  internalTxAmount,
                                                  internalToAddress,
                                                  false
                                              );
                                    }
                                }
                                return [];
                            })
                            .flat();
                    }

                    // We don't support other contracts like AccountCreateContract or TriggerSmartContract or other types of data returned
                    return [];
                })
                .flat();
        } catch (e) {
            improveAndRethrow(e, "trongridTronTransactionsProvider.getDataByResponse");
        }
    }

    doesSupportPagination() {
        return true;
    }

    changeQueryParametersForPageNumber(params, previousResponse, pageNumber, subRequestIndex = 0) {
        return [params[0], previousResponse?.data?.meta?.links?.next];
    }

    checkWhetherResponseIsForLastPage(previousResponse, currentResponse, currentPageNumber, subRequestIndex = 0) {
        return currentResponse?.data?.meta?.links?.next == null;
    }
}

export class TronTransactionsProvider {
    static _provider = new CachedRobustExternalApiCallerService(
        "tronTransactionsProvider",
        // Trongrid used with higher priority because it retrieves internal transaction also
        [new TrongridTronTransactionsProvider(), new TronscanTronTransactionsProvider()],
        70000,
        70,
        1000,
        false,
        mergeTwoArraysByItemIdFieldName
    );

    /**
     * Retrieves TRX transactions.
     *
     * For self-sending transactions returns two history items.
     * For internal transactions uses ID of parent transaction as a transaction id because tronscan explorer doesn't
     * provide data for internal transaction id.
     *
     * @param address {string} address string to get transactions for
     * @returns {Promise<TransactionsHistoryItem[]>} list of history items
     */
    static async getTronTransactions(address) {
        return await this._provider.callExternalAPICached([address], 15000, null, 1, cachesHashFunction);
    }

    static actualizeCacheWithNewTransaction(coin, address, txData, txId) {
        try {
            actualizeCacheWithNewTransactionSentFromAddress(
                this._provider,
                [address],
                cachesHashFunction,
                coin,
                address,
                txData,
                txId
            );
        } catch (e) {
            improveAndRethrow(e, "tronTransactionsProvider.actualizeCacheWithNewTransaction");
        }
    }
}

const cachesHashFunction = params => `txs_tron_${params[0]}`;
