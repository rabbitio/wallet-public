import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { getCurrentNetwork } from "../../../common/services/internal/storage";
import { Coins } from "../../coins";
import { ETH_PR_ALC_GOERLI_K, ETH_PR_K } from "../../../../properties";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { Coin } from "../../common/models/coin";
import { BigNumber } from "ethers";
import { provideFirstSeenTime } from "../../common/external-apis/utils/firstSeenTimeHolder";
import { EthTransactionsUtils } from "../lib/ethTransactionsUtils";
import { TransactionsHistoryItem } from "../../common/models/transactionsHistoryItem";
import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";
import { mergeTwoArraysByItemIdFieldName } from "../../common/utils/cacheActualizationUtils";
import { ApiGroups } from "../../../common/external-apis/apiGroups";

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

    doesSupportPagination() {
        return true;
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const isMainnet = getCurrentNetwork(Coins.COINS.ETH) === Coins.COINS.ETH.mainnet;
            const networkPrefix = isMainnet ? "mainnet" : "goerli";
            const apiKey = isMainnet ? ETH_PR_K : ETH_PR_ALC_GOERLI_K;
            return `https://eth-${networkPrefix}.g.alchemy.com/v2/${apiKey}`;
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
                                      c.protocol === Coin.PROTOCOLS.ERC20
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
                    const amount = BigNumber.from(transfer.rawContract.value).toString();
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
        [new AlchemyEthereumBlockchainTransactionsProvider()],
        60000,
        70,
        1000,
        false,
        mergeTwoArraysByItemIdFieldName
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
