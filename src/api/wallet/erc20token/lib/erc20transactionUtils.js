import { ethers } from "ethers";
import { BigNumber } from "bignumber.js";

import { AmountUtils, improveAndRethrow } from "@rabbitio/ui-kit";

import { ERC20_ABI } from "./erc20abi.js";

export class Erc20transactionUtils {
    static TRANSFER_HEX = "0xa9059cbb";
    // TODO: [feature, moderate] Support transferFrom method. task_id=9239674b09744d9581c3e51e42854af7
    // static TRANSFER_FROM_HEX = "0x23b872dd";

    /**
     * Converts the ethereum blockchain transaction to TransactionsHistoryItem with specific ERC20 token details.
     * Supports two ERC20 methods: "transfer" and "transferFrom".
     * Sets proper "to", "amount" in token atoms and sendet
     *
     * @param coin {Coin} token to convert the history item to
     * @param transactionsHistoryItem {TransactionsHistoryItem} the ethereum transaction history item
     * @returns {TransactionsHistoryItem} the same object but with proper address, amount and isSendingAndReceiving flag set
     */
    static etherTransactionsHistoryItemToErc20TransactionsHistoryItem(coin, transactionsHistoryItem) {
        try {
            const data = transactionsHistoryItem.full_tx.data;
            let receiverAddress;
            let amount;
            if (data.startsWith(this.TRANSFER_HEX)) {
                receiverAddress = `0x${data.slice(34, 74)}`.toLowerCase();
                amount = AmountUtils.trim(BigNumber("0x" + data.slice(74)), 0);
                // TODO: [feature, moderate] Support transferFrom method. task_id=9239674b09744d9581c3e51e42854af7
                // } else if (data.startWith(this.TRANSFER_FROM_HEX)) {
                //     sender = data.slice(34, 74);
                //     receiverAddress = `0x{data.slice(98, 138)}`;
                //     amount = BigNumber.from(data.slice(178));
            } else {
                throw new Error("Method is not supported: " + data);
            }

            transactionsHistoryItem.ticker = coin.ticker;
            transactionsHistoryItem.tickerPrintable = coin.tickerPrintable;
            transactionsHistoryItem.address = receiverAddress;
            transactionsHistoryItem.amount = amount;
            transactionsHistoryItem.isSendingAndReceiving =
                transactionsHistoryItem.full_tx.from.toLowerCase() === receiverAddress;

            return transactionsHistoryItem;
        } catch (e) {
            improveAndRethrow(e, "etherTransactionsHistoryItemToErc20TransactionsHistoryItem");
        }
    }

    /**
     * Checks whether given transaction is ERC20 token transfer.
     * Useful as ERC20 supports many transaction types. But we check only for transfer and TODO: transferFrom
     *
     * @param coin {Coin} coin to check for
     * @param transactionsHistoryItem {TransactionsHistoryItem} ethereum tx history item to check
     * @return {boolean} true if the given history item is erc20 token transfer
     */
    static isEthereumTransactionErc20TokenTransfer(coin, transactionsHistoryItem) {
        try {
            const rawTx = transactionsHistoryItem.full_tx;
            const toIsTokenAddress = rawTx?.to.toLowerCase() === coin.tokenAddress;

            const dataStartsWithTransferMethod = rawTx.data.startsWith(this.TRANSFER_HEX);

            // TODO: [feature, moderate] Support transferFrom method. task_id=9239674b09744d9581c3e51e42854af7
            // const dataStartsWithTransferFromMethod = rawTx.data.startsWith(this.TRANSFER_FROM_HEX);
            // return toIsTokenAddress && (dataStartsWithTransferMethod || dataStartsWithTransferFromMethod);

            return toIsTokenAddress && dataStartsWithTransferMethod;
        } catch (e) {
            improveAndRethrow(e, "isEthereumTransactionErc20TokenTransfer");
        }
    }

    /**
     * Composes hex string for data field of the ethereum transaction
     *
     * @param receiver {string} address of receiver
     * @param amountAtoms {string} amount of atoms to send
     * @return {string} hex string of data for erc20 transfer method
     */
    static composeEthereumTransactionDataForGivenParams(receiver, amountAtoms) {
        try {
            const erc20Interface = new ethers.utils.Interface(ERC20_ABI);
            return erc20Interface.encodeFunctionData("transfer", [receiver, AmountUtils.toIntegerString(amountAtoms)]);
        } catch (e) {
            improveAndRethrow(e, "composeEthereumTransactionDataForGivenParams");
        }
    }
}
