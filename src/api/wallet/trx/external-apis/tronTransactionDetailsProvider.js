import {
    AmountUtils,
    improveAndRethrow,
    CachedRobustExternalApiCallerService,
    ExternalApiProvider,
    ApiGroups,
} from "@rabbitio/ui-kit";

import { Coins } from "../../coins.js";
import { TransactionsHistoryItem } from "../../common/models/transactionsHistoryItem.js";
import { tronUtils } from "../adapters/tronUtils.js";
import { computeConfirmationsCountByTimestamp } from "../lib/blocks.js";
import { provideFirstSeenTime } from "../../common/external-apis/utils/firstSeenTimeHolder.js";
import { API_KEYS_PROXY_URL } from "../../../common/backend-api/utils.js";
import { STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS } from "../../../common/utils/ttlConstants.js";
import { Storage } from "../../../common/services/internal/storage.js";
import { cache } from "../../../common/utils/cache.js";

class TrongridTransactionDetailsProvider extends ExternalApiProvider {
    constructor() {
        super("", ["post", "post"], 15000, ApiGroups.TRONGRID);
    }

    doesRequireSubRequests() {
        return true;
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const endpointLastPart = subRequestIndex === 0 ? "gettransactionbyid" : "gettransactioninfobyid";
            const originalApiPath = `/wallet/${endpointLastPart}`;
            return `${API_KEYS_PROXY_URL}/${this.apiGroup.backendProxyIdGenerator(Storage.getCurrentNetwork(Coins.COINS.TRX)?.key)}${originalApiPath}`;
        } catch (e) {
            improveAndRethrow(e, "trongridTransactionDetailsProvider.composeQueryString");
        }
    }

    composeBody(params, subRequestIndex = 0) {
        const txId = params[0];
        return JSON.stringify({ value: txId });
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            const myAddress = params[1];
            if (subRequestIndex === 0) {
                // gettransactionbyid endpoint called
                const t = response?.data ?? {};
                const id = t?.txID;
                const timestamp = t?.raw_data?.timestamp ?? provideFirstSeenTime(id);
                const feeLimit = AmountUtils.toIntegerString(t?.raw_data?.fee_limit ?? null);
                const confirmations = t?.raw_data?.timestamp ? computeConfirmationsCountByTimestamp(timestamp) : 0;
                if ((t?.raw_data?.contract ?? [])[0]?.type === "TransferContract") {
                    const toAddress = tronUtils.hexAddressToBase58check(
                        (t?.raw_data?.contract ?? [])[0]?.parameter?.value?.to_address
                    );
                    const isSelfSending = toAddress === myAddress;
                    const type = toAddress === myAddress ? "in" : "out";
                    const amount = AmountUtils.toIntegerString(
                        (t?.raw_data?.contract ?? [])[0]?.parameter?.value?.amount
                    );
                    return new TransactionsHistoryItem(
                        id,
                        Coins.COINS.TRX.ticker,
                        Coins.COINS.TRX.tickerPrintable,
                        type,
                        amount,
                        confirmations,
                        timestamp,
                        toAddress,
                        feeLimit,
                        t,
                        false,
                        isSelfSending
                    );
                }
            } else {
                // gettransactioninfobyid endpoint called, extracting internal TRX and internal TRC20 transactions. Also pure TRC20 sending (not internal)
                const t2 = response?.data;
                const id = t2.id;
                const txFromFirstApiCall = iterationsData[0];
                const improvedFee = t2.fee != null ? AmountUtils.toIntegerString(t2.fee) : txFromFirstApiCall?.fees;
                txFromFirstApiCall && (txFromFirstApiCall.fees = improvedFee);
                const confirmations = t2.blockTimeStamp ? computeConfirmationsCountByTimestamp(t2.blockTimeStamp) : 0;
                const timestamp = t2.blockTimeStamp ?? provideFirstSeenTime(id);
                let trc20TransfersFromLog = [];
                if (Array.isArray(t2.log)) {
                    /**
                     * Searching for TRC20 token transfers to/from current wallet. Here we use .log of the transaction
                     * as it contains more data than the internal transactions section returned by this provider. Also,
                     * this section has item for pure TRC20 sending transaction without internal transactions
                     */
                    trc20TransfersFromLog = t2.log
                        .map(logItem => {
                            const contractAddress = tronUtils.hexAddressToBase58check("41" + logItem.address);
                            const coin = Coins.getSupportedCoinsList().find(c => c.tokenAddress === contractAddress);
                            if (
                                coin &&
                                Array.isArray(logItem.topics) &&
                                logItem.topics.length === 3 &&
                                logItem.topics[1]?.length === 64 &&
                                logItem.topics[2]?.length === 64 &&
                                typeof logItem.data === "string"
                            ) {
                                const addressFrom = tronUtils.hexAddressToBase58check(
                                    "41" + logItem.topics[1].slice(24)
                                );
                                const addressTo = tronUtils.hexAddressToBase58check("41" + logItem.topics[2].slice(24));
                                const type = addressFrom === myAddress ? "out" : addressTo === myAddress ? "in" : null;
                                const amount = AmountUtils.toIntegerString(`0x${logItem.data}`);
                                if (type) {
                                    return new TransactionsHistoryItem(
                                        id,
                                        coin.ticker,
                                        coin.tickerPrintable,
                                        type,
                                        amount,
                                        confirmations,
                                        timestamp,
                                        addressTo,
                                        improvedFee,
                                        t2,
                                        false,
                                        false
                                    );
                                }
                            }
                            return [];
                        })
                        .flat();
                }
                let internalTrxTransactions = [];
                if (Array.isArray(t2.internal_transactions)) {
                    /**
                     * Here we are searching for internal transactions causing TRX transfer from/to address of
                     * the current wallet. We don't extract TRC20 txs here because they already extracted from .log
                     * of the transaction.
                     */
                    internalTrxTransactions = t2.internal_transactions
                        .filter(internal => (internal?.callValueInfo ?? [])[0]?.callValue)
                        .map(internalTx => {
                            const addressFrom = tronUtils.hexAddressToBase58check(internalTx.caller_address);
                            const addressTo = tronUtils.hexAddressToBase58check(internalTx.transferTo_address);
                            const amount = AmountUtils.toIntegerString(internalTx.callValueInfo[0].callValue);
                            if (
                                addressFrom &&
                                addressTo &&
                                amount &&
                                (addressTo === myAddress || addressFrom === myAddress)
                            ) {
                                const isSelfSending = addressTo && addressTo === addressFrom;
                                const type = myAddress === addressTo ? "in" : "out";
                                return new TransactionsHistoryItem(
                                    id,
                                    Coins.COINS.TRX.ticker,
                                    Coins.COINS.TRX.tickerPrintable,
                                    type,
                                    amount,
                                    confirmations,
                                    timestamp,
                                    addressTo,
                                    improvedFee,
                                    t2,
                                    false,
                                    isSelfSending
                                );
                            }
                            return [];
                        })
                        .flat();
                }
                const result = [txFromFirstApiCall ?? [], ...trc20TransfersFromLog, ...internalTrxTransactions].flat();
                return result?.length ? result : null;
            }
            return null;
        } catch (e) {
            improveAndRethrow(e, "trongridTransactionDetailsProvider.getDataByResponse");
        }
    }

    incorporateIterationsData(iterationsData) {
        // We aggregate data from two sub requests in the last sub-request processing so taking only last iteration data.
        // TODO: [feature, moderate] Add ability to show all internal transfers to user task_id=1091423c08de4144ac82faa2db291943
        return iterationsData.length ? iterationsData[iterationsData.length - 1] : null;
    }
}

export class TronBlockchainTransactionDetailsProvider {
    static _provider = new CachedRobustExternalApiCallerService(
        "tronBlockchainTransactionDetailsProvider",
        cache,
        [new TrongridTransactionDetailsProvider()], // TODO: [feature, high] add more providers. task_id=c246262b0e7f43dfa2a9b0e30c947ad7
        STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS,
        false
    );

    /**
     * @param id {string}
     * @param address {string}
     * @return {Promise<(TransactionsHistoryItem[]|null)>}
     */
    static async getTronTransactionDetails(id, address) {
        try {
            return await this._provider.callExternalAPICached(
                [id, address],
                15000,
                null,
                1,
                params => `txdetails-${address}-${id}`,
                true
            );
        } catch (e) {
            improveAndRethrow(e, "getTronTransactionDetails");
        }
    }
}
