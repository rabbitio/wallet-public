import { BigNumber } from "ethers";

import { ETH_PR_K_ETHSCAN } from "../../../../properties";
import { improveAndRethrow, logError } from "../../../common/utils/errorUtils";
import { TransactionsHistoryItem } from "../../common/models/transactionsHistoryItem";
import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { CachedRobustExternalApiCallerService } from "../../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";

/**
 * Params for this provider's endpoint are:
 *   params[0] {Coin} coin to get txs for
 *   params[1] {string} address to get txs for
 *   params[2] {number} page number to start from, it counts from 1
 */
class EtherScanErc20TransactionsProvider extends ExternalApiProvider {
    composeQueryString(params, subRequestIndex = 0) {
        return `?module=account&action=tokentx&contractaddress=${params[0]?.tokenAddress}&address=${
            params[1]
        }&page=${params[2] ?? 1}&offset=${this.maxPageLength}&apikey=${ETH_PR_K_ETHSCAN}`;
    }

    getDataByResponse(response, params = [], subRequestIndex = 0) {
        const txs = response?.data?.result;

        if (!txs || !Array.isArray(txs)) {
            return [];
        }

        const myAddressLowercase = params[1].toLowerCase();
        const notFlatTxs = txs.map(tx => {
            const composeItem = (type, sendingAndReceiving = false) =>
                new TransactionsHistoryItem(
                    tx.hash,
                    params[0].ticker,
                    params[0].tickerPrintable,
                    type,
                    tx.value,
                    tx.confirmations,
                    +tx.timeStamp * 1000,
                    tx.to,
                    BigNumber.from(tx.gasUsed)
                        .mul(tx.gasPrice)
                        .toString(),
                    tx,
                    false,
                    sendingAndReceiving
                );
            const historyItems = [composeItem(tx.to.toLowerCase() === myAddressLowercase ? "in" : "out")];
            if (tx.to === tx.from) {
                historyItems[0].isSendingAndReceiving = true;
                historyItems.push(composeItem("out", true));
            }

            return historyItems;
        });

        return notFlatTxs.flat();
    }

    doesSupportPagination() {
        return true;
    }

    changeQueryParametersForPageNumber(params, previousResponse, pageNumber, subRequestIndex = 0) {
        // NOTE: EtherScan uses page numbers starting with 1 (not with 0)
        return [params[0], params[1], pageNumber];
    }

    checkWhetherResponseIsForLastPage(previousResponse, currentResponse, currentPageNumber, subRequestIndex = 0) {
        return (currentResponse?.data?.result?.length ?? 0) < this.maxPageLength;
    }
}

// TODO: [tests, moderate] implement units/integration tests
export class Erc20TransactionsProvider {
    static _provider = new CachedRobustExternalApiCallerService(
        "erc20TransactionsProvider",
        [new EtherScanErc20TransactionsProvider("https://api.etherscan.io/api", "get", 20000, 3, 100)],
        12000,
        20,
        1000,
        logError
    );

    /**
     * Retrieves ethereum transactions sending given erc20 token for given address
     *
     * @param coin {Coin} ERC20 token to get transactions for
     * @param address {string} ethereum address to gt transactions for
     * @param cancelProcessor {CancelProcessing} canceller if you need to control execution outside
     * @returns {Promise<TransactionsHistoryItem[]>} history items
     */
    static async getErc20TransactionsByAddress(coin, address, cancelProcessor = null) {
        try {
            return await this._provider.callExternalAPICached(
                [coin, address, 1],
                16000,
                cancelProcessor?.getToken(),
                2,
                () => address
            );
        } catch (e) {
            improveAndRethrow(e, "getErc20TransactionsByAddress");
        }
    }
}

export function createErc20TransactionsProviderForTesting(params) {
    return new CachedRobustExternalApiCallerService(
        "erc20TransactionsProvider",
        [new EtherScanErc20TransactionsProvider(...params)],
        10000,
        20,
        1000,
        logError
    );
}
