import { Wallet } from "../common/models/wallet";
import BalanceService from "./services/balanceService";
import { improveAndRethrow } from "../../common/utils/errorUtils";
import { BtcTransactionsHistoryService } from "./services/btcTransactionsHistoryService";
import { BtcTransactionDetailsService } from "./services/btcTransactionDetailsService";
import AddressesService from "./services/addressesService";
import PaymentService from "./services/paymentService";
import AddressesServiceInternal from "./services/internal/addressesServiceInternal";
import { bitcoin } from "./bitcoin";
import { transactionsDataProvider } from "./services/internal/transactionsDataProvider";
import { Transaction } from "./models/transaction/transaction";

class BitcoinWallet extends Wallet {
    constructor() {
        super(bitcoin, true);
    }

    async calculateBalance() {
        try {
            return (await BalanceService.getSpendableWalletBalance()).btcAmount;
        } catch (e) {
            improveAndRethrow(e, "calculateBalance");
        }
    }

    async getTransactionsList() {
        try {
            return await BtcTransactionsHistoryService.getBtcTransactionsHistory();
        } catch (e) {
            improveAndRethrow(e, "getTransactionsList");
        }
    }

    async getTransactionDetails(txId) {
        try {
            return await BtcTransactionDetailsService.getBTCTransactionDetails(txId);
        } catch (e) {
            improveAndRethrow(e, "getTransactionDetails");
        }
    }

    async isTxBelongingToWalletsCoin(txId) {
        try {
            return await BtcTransactionDetailsService.isTransactionBelongsToBitcoin(txId);
        } catch (e) {
            improveAndRethrow(e, "isTxBelongingToWalletsCoin");
        }
    }

    async getCurrentAddress() {
        try {
            return await AddressesService.getCurrentExternalAddress();
        } catch (e) {
            improveAndRethrow(e, "getCurrentAddress");
        }
    }

    isAddressValid(address) {
        try {
            return PaymentService.isAddressValidForSending(address);
        } catch (e) {
            improveAndRethrow(e, "isAddressValid");
        }
    }

    async createTransactionsWithFakeSignatures(address, coinAmount, isSendAll, currentNetwork, balanceCoins) {
        try {
            return await PaymentService.createTransactionsWithFakeSignatures(
                address,
                coinAmount,
                isSendAll,
                currentNetwork
            );
        } catch (e) {
            improveAndRethrow(e, "createTransactionsWithFakeSignatures");
        }
    }

    async createTransactionAndBroadcast(mnemonic, passphrase, txData) {
        try {
            return await PaymentService.createTransactionAndBroadcast(mnemonic, passphrase, txData);
        } catch (e) {
            improveAndRethrow(e, "createTransactionAndBroadcast");
        }
    }

    async createNewAddress(label) {
        try {
            return await AddressesService.createNewExternalAddress(label);
        } catch (e) {
            improveAndRethrow(e, "createNewAddress");
        }
    }

    async exportWalletData(password) {
        try {
            return await AddressesServiceInternal.exportAddressesWithPrivateKeysByPassword(password);
        } catch (e) {
            improveAndRethrow(e, "exportWalletData");
        }
    }

    actualizeLocalCachesWithNewTransactionData(sentCoin, txData, txId) {
        try {
            const tx = Transaction.fromTxData(txData, txId);
            transactionsDataProvider.pushNewTransactionToCache(tx);
        } catch (e) {
            improveAndRethrow(e, "actualizeLocalCachesWithNewTransactionData");
        }
    }
}

export const bitcoinWallet = new BitcoinWallet();
