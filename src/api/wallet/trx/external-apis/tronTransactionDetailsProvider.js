import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { TRONGR_PR_K } from "../../../../properties";
import { getCurrentNetwork } from "../../../common/services/internal/storage";
import { Coins } from "../../coins";
import { TransactionsHistoryItem } from "../../common/models/transactionsHistoryItem";
import { tronUtils } from "../adapters/tronUtils";
import { computeConfirmationsCountByTimestamp } from "../lib/blocks";
import { provideFirstSeenTime } from "../../common/external-apis/utils/firstSeenTimeHolder";
import { ApiGroups } from "../../../common/external-apis/apiGroups";

class TrongridTransactionDetailsProvider extends ExternalApiProvider {
    constructor() {
        super("", ["post", "post"], 15000, ApiGroups.TRONGRID, { "TRON-PRO-API-KEY": TRONGR_PR_K });
    }

    doesRequireSubRequests() {
        return true;
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const network = getCurrentNetwork(Coins.COINS.TRX);
            const networkPrefix = network === Coins.COINS.TRX.mainnet ? "api" : "nile";
            const endpointLastPart = subRequestIndex === 0 ? "gettransactionbyid" : "gettransactioninfobyid";
            return `https://${networkPrefix}.trongrid.io/wallet/${endpointLastPart}`;
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
                const feeLimit = "" + (t?.raw_data?.fee_limit ?? "");
                const confirmations = t?.raw_data?.timestamp ? computeConfirmationsCountByTimestamp(timestamp) : 0;
                if ((t?.raw_data?.contract ?? [])[0]?.type === "TransferContract") {
                    const toAddress = tronUtils.hexAddressToBase58check(
                        (t?.raw_data?.contract ?? [])[0]?.parameter?.value?.to_address
                    );
                    const isSelfSending = toAddress === myAddress;
                    const type = toAddress === myAddress ? "in" : "out";
                    const amount = "" + (t?.raw_data?.contract ?? [])[0]?.parameter?.value?.amount;
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
                const improvedFee = t2.fee != null ? "" + t2.fee : txFromFirstApiCall?.fees;
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
                                const amount = "" + +`0x${logItem.data}`;
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
                            const amount = "" + internalTx.callValueInfo[0].callValue;
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
        [new TrongridTransactionDetailsProvider()],
        70000,
        70,
        1000,
        false
    );

    /**
     * @param id
     * @param address
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
