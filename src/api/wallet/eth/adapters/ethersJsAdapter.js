import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { TransactionsHistoryItem } from "../../common/models/transactionsHistoryItem";
import { Coins } from "../../coins";
import { provideFirstSeenTime } from "../../common/external-apis/utils/firstSeenTimeHolder";
import { getHash } from "../../../common/adapters/crypto-utils";

export class EthersJsAdapter {
    /**
     * Converts ethers.js transaction to TransactionsHistoryItem
     * @param ethersJsTransactionResponse {Object} ethers.js TransactionResponse
     * @param ethersJsBlockResponse {Object} ethers.js BlockResponse
     * @param currentWalletAddress {string|null} current wallet address or null. In case of null the returned type is not guarantied
     * @param fee {string} fee of this transaction
     * @returns {TransactionsHistoryItem} unified transaction history item clear for the whole application
     */
    static transactionToEthHistoryItem(ethersJsTransactionResponse, ethersJsBlockResponse, currentWalletAddress, fee) {
        try {
            const type =
                ethersJsTransactionResponse.to?.toLowerCase() === currentWalletAddress?.toLowerCase() ? "in" : "out";
            let timestamp = ethersJsTransactionResponse.timestamp ? ethersJsTransactionResponse.timestamp * 1000 : null;
            if (!timestamp) {
                timestamp = ethersJsBlockResponse.timestamp
                    ? ethersJsBlockResponse.timestamp * 1000
                    : provideFirstSeenTime(getHash(ethersJsTransactionResponse.hash)) * 1000;
            }

            return new TransactionsHistoryItem(
                ethersJsTransactionResponse.hash,
                Coins.COINS.ETH.ticker,
                Coins.COINS.ETH.tickerPrintable,
                type,
                ethersJsTransactionResponse.value.toString(),
                ethersJsTransactionResponse.confirmations,
                timestamp,
                ethersJsTransactionResponse.to.toLowerCase(),
                fee,
                ethersJsTransactionResponse,
                false,
                ethersJsTransactionResponse.to === ethersJsTransactionResponse.from,
                false,
                false
            );
        } catch (e) {
            improveAndRethrow(e, "transactionToEthHistoryItem");
        }
    }
}
