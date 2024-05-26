import {
    AmountUtils,
    improveAndRethrow,
    CachedRobustExternalApiCallerService,
    ExternalApiProvider,
    ApiGroups,
} from "@rabbitio/ui-kit";

import { Coins } from "../../coins.js";
import { provideFirstSeenTime } from "../../common/external-apis/utils/firstSeenTimeHolder.js";
import { EthTransactionsUtils } from "../lib/ethTransactionsUtils.js";
import { TransactionsHistoryItem } from "../../common/models/transactionsHistoryItem.js";
import { mergeTwoTransactionsArraysAndNotifyAboutNewTransactions } from "../../common/utils/cacheActualizationUtils.js";
import { API_KEYS_PROXY_URL } from "../../../common/backend-api/utils.js";
import { STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS } from "../../../common/utils/ttlConstants.js";
import { ERC20 } from "../../erc20token/erc20Protocol.js";
import { Storage } from "../../../common/services/internal/storage.js";
import { cache } from "../../../common/utils/cache.js";

class AlchemyEthereumBlockchainTransactionsProvider extends ExternalApiProvider {
    constructor() {
        /**
         * WARNING: this provider has 2 significant downsides:
         * 1. It requires 2 calls to get history because ridiculously they cannot return both sending and receiving
         * transactions for the same address in the same request.
         * 2. It doesn't provide any fee data for all transaction types. So for sending transaction you need to perform
         * additional request to get fee.
         */
        super("", ["post", "post"], 15000, ApiGroups.ALCHEMY, null, 1000);
    }

    doesRequireSubRequests() {
        return true;
    }

    doesSupportPagination() {
        return true;
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            return `${API_KEYS_PROXY_URL}/${this.apiGroup.backendProxyIdGenerator(Storage.getCurrentNetwork(Coins.COINS.ETH)?.key)}`;
        } catch (e) {
            improveAndRethrow(e, "alchemyEthereumBlockchainTransactionsProvider.composeQueryString");
        }
    }

    composeBody(params, subRequestIndex = 0) {
        try {
            const address = params[0];
            const pageKey = params[1];
            return {
                id: 1,
                jsonrpc: "2.0",
                method: "alchemy_getAssetTransfers",
                params: [
                    {
                        fromBlock: "0x0",
                        toBlock: "latest",
                        category: ["external", "internal", "erc20"],
                        withMetadata: true,
                        excludeZeroValue: false,
                        maxCount: `0x${Number(this.maxPageLength).toString(16)}`,
                        order: "asc",
                        ...(pageKey ? { pageKey: pageKey } : {}),
                        ...(subRequestIndex === 0 ? { toAddress: address } : { fromAddress: address }),
                    },
                ],
            };
        } catch (e) {
            improveAndRethrow(e, "alchemyEthereumBlockchainTransactionsProvider.composeBody");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        const myAddress = params[0];
        try {
            const transfers = response?.data?.result?.transfers;
            if (!Array.isArray(transfers)) {
                throw new Error("Wrong format of data returned by alchemy provider for ethereum blockchain transfers");
            }
            return transfers
                .map(transfer => {
                    const coin =
                        transfer.asset === Coins.COINS.ETH.ticker
                            ? Coins.COINS.ETH
                            : Coins.getSupportedCoinsList().find(
                                  c =>
                                      (c.ticker === transfer.asset || c.tickerPrintable === transfer.asset) &&
                                      c.protocol === ERC20
                              );
                    if (!coin) {
                        // Means coin is not supported
                        return [];
                    }
                    if (
                        coin === Coins.COINS.ETH &&
                        (transfer?.value === "0" || transfer?.value === 0 || transfer?.rawContract?.value === "0x0")
                    ) {
                        // Means this tx is not sending any coins
                        return [];
                    }
                    const type = transfer.to === myAddress ? "in" : "out";
                    const isSendingAndReceiving = transfer.to === transfer.from;
                    const amount = AmountUtils.trim(transfer.rawContract.value, 0);
                    let timestamp = Date.parse(transfer?.metadata?.blockTimestamp ?? "");
                    timestamp = timestamp ? timestamp : provideFirstSeenTime(transfer.hash);
                    const confirmations = EthTransactionsUtils.estimateEthereumConfirmationsByTimestamp(timestamp);
                    const composeTx = type =>
                        new TransactionsHistoryItem(
                            transfer.hash,
                            coin.ticker,
                            coin.tickerPrintable,
                            type,
                            amount,
                            confirmations,
                            timestamp,
                            transfer.to,
                            null,
                            transfer,
                            false,
                            isSendingAndReceiving
                        );
                    return isSendingAndReceiving ? [composeTx("in"), composeTx("out")] : [composeTx(type)];
                })
                .flat();
        } catch (e) {
            improveAndRethrow(e, "alchemyEthereumBlockchainTransactionsProvider.getDataByResponse");
        }
    }

    changeQueryParametersForPageNumber(params, previousResponse, pageNumber, subRequestIndex = 0) {
        try {
            const address = params[0];
            const pageKey = previousResponse?.data?.result?.pageKey;
            return [address, pageKey];
        } catch (e) {
            improveAndRethrow(e, "alchemyEthereumBlockchainTransactionsProvider.changeQueryParametersForPageNumber");
        }
    }

    checkWhetherResponseIsForLastPage(previousResponse, currentResponse, currentPageNumber, subRequestIndex = 0) {
        try {
            return currentResponse?.data?.result?.pageKey == null;
        } catch (e) {
            improveAndRethrow(e, "alchemyEthereumBlockchainTransactionsProvider.checkWhetherResponseIsForLastPage");
        }
    }
}

export class EthereumBlockchainTransactionsProvider {
    static _provider = new CachedRobustExternalApiCallerService(
        "ethereumBlockchainTransactionsProvider",
        cache,
        [new AlchemyEthereumBlockchainTransactionsProvider()],
        STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS,
        false,
        mergeTwoTransactionsArraysAndNotifyAboutNewTransactions
    );

    static async getEthereumBlockchainTransactions(address) {
        try {
            return await this._provider.callExternalAPICached([address], 15000, null, 1, hashFunctionForParams);
        } catch (e) {
            improveAndRethrow(e, "getEthereumBlockchainTransactions");
        }
    }
}

const hashFunctionForParams = params => `all_ethereum_blockchain_txs_${params[0]}`;
