import { improveAndRethrow } from "@rabbitio/ui-kit";

import { TronBlockchainTransactionDetailsProvider } from "../external-apis/tronTransactionDetailsProvider.js";
import { TrxAddressesService } from "./trxAddressesService.js";
import { TronTransactionsProvider } from "../external-apis/tronTransactionsProvider.js";
import { Coins } from "../../coins.js";
import { Trc20TransactionsProvider } from "../../trc20token/external-apis/trc20TransactionsProvider.js";
import { TRC20 } from "../../trc20token/trc20Protocol.js";

export class TronTransactionDetailsService {
    // TODO: [tests, moderate] sophisticated logic, prays for unit tests
    static async getTronTransactionDetails(coin, txId, type) {
        try {
            const address = TrxAddressesService.getCurrentTrxAddress();
            let txDataItems = [];
            if (coin === Coins.COINS.TRX) {
                txDataItems = (await TronTransactionsProvider.getTronTransactions(address)) ?? [];
            } else if (coin.protocol === TRC20) {
                txDataItems = (await Trc20TransactionsProvider.getTrc20Transactions(address)) ?? [];
            } else {
                return null;
            }
            txDataItems = txDataItems.filter(
                t => t.txid === txId && t.ticker === coin.ticker && (!type || t.type === type)
            );
            let detailsProviderWasCalled = false;
            if (!txDataItems.length) {
                txDataItems = await TronBlockchainTransactionDetailsProvider.getTronTransactionDetails(txId, address);
                detailsProviderWasCalled = true;
            }
            if (txDataItems.length) {
                let result = null;
                if (txDataItems.length === 1) {
                    result = txDataItems[0];
                }
                if (coin) {
                    const relatedToCoin = txDataItems.filter(tx => tx.ticker === coin.ticker);
                    const relatedToCoinByType = relatedToCoin.filter(tx => tx.type === type);
                    if (relatedToCoin.length === 1 || (relatedToCoin.length > 1 && !type)) {
                        result = relatedToCoin[0];
                    } else if (relatedToCoinByType.length > 0) {
                        // Here we can have several transactions with same type sending same coin internally inside the
                        // main transaction. We use just first one in the list for simplicity as this case is really
                        // rare, and we can allow this trouble for now.
                        result = relatedToCoinByType[0];
                    }
                }
                if (result != null && result.fees == null && !detailsProviderWasCalled) {
                    // Performing additional request to get missing fee as all trc20 txs list providers return no fee data
                    const detailsItemsWithFee =
                        await TronBlockchainTransactionDetailsProvider.getTronTransactionDetails(txId, address);
                    result = detailsItemsWithFee?.find(
                        item => item.ticker === result.ticker && item.type === result.type
                    );
                    if (!result) {
                        /* This means we have an item in history but no corresponding item when requesting details.
                         * It can be just the details retrieval error but also can be a mismatch caused by not correct history
                         * item - tronscan trc20 history returns no contract address, so we check by contract name. So
                         * the history item can be not for the original token but for a scam token.
                         * So here we better return null instead of the original history item to not provide a user with the wrong info.
                         */
                        return null;
                    }
                }
                return result;
            }
            return null;
        } catch (e) {
            improveAndRethrow(e, "tronTransactionDetailsService");
        }
    }

    static async isTxBelongsToTronNetwork(coin, txId) {
        try {
            const address = TrxAddressesService.getCurrentTrxAddress();
            const detailsList = await TronBlockchainTransactionDetailsProvider.getTronTransactionDetails(txId, address);
            /**
             * When user opens page by some tx ID we just try if it related to given coin.
             * Here we return true just when we see that the retrieved details list has at least one transaction
             * related to given coin. It is not exact solution for now bot absolutely reasonable as we have no data
             * what tx to belong this one as it can have internal transactions.
             *
             * Later we can improve this TODO: [feature, moderate] task_id=1091423c08de4144ac82faa2db291943
             */
            return !!(detailsList ?? []).find(d => d.ticker === coin.ticker);
        } catch (e) {
            improveAndRethrow(e, "isTxBelongsToTronNetwork");
        }
    }
}
