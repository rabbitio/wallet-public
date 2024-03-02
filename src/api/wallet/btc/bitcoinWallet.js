import { improveAndRethrow } from "@rabbitio/ui-kit";

import { Wallet } from "../common/models/wallet.js";
import BalanceService from "./services/balanceService.js";
import { BtcTransactionsHistoryService } from "./services/btcTransactionsHistoryService.js";
import { BtcTransactionDetailsService } from "./services/btcTransactionDetailsService.js";
import AddressesService from "./services/addressesService.js";
import PaymentService from "./services/paymentService.js";
import AddressesServiceInternal from "./services/internal/addressesServiceInternal.js";
import { bitcoin } from "./bitcoin.js";
import { transactionsDataProvider } from "./services/internal/transactionsDataProvider.js";
import { Transaction } from "./models/transaction/transaction.js";
import { BitcoinAddresses } from "./lib/addresses.js";

class BitcoinWallet extends Wallet {
    constructor() {
        super(bitcoin, true);
    }

    async calculateBalance() {
        try {
            // TODO: [feature, high] We should add confirmed balance displaying for sending and swapping task_id=952f713a09ac4a04882e5ede9bd5fbc9
            return await BalanceService.getUnconfirmedWalletBalance();
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_calculateBalance`);
        }
    }

    async getTransactionsList() {
        try {
            return await BtcTransactionsHistoryService.getBtcTransactionsHistory();
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_getTransactionsList`);
        }
    }

    async getTransactionDetails(txId, transactionType = null) {
        try {
            return await BtcTransactionDetailsService.getBTCTransactionDetails(txId);
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_getTransactionDetails`);
        }
    }

    async isTxBelongingToWalletsCoin(txId) {
        try {
            return await BtcTransactionDetailsService.isTransactionBelongsToBitcoin(txId);
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_isTxBelongingToWalletsCoin`);
        }
    }

    async getCurrentAddress() {
        try {
            return await AddressesService.getCurrentExternalAddress();
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_getCurrentAddress`);
        }
    }

    isAddressValid(address) {
        try {
            return { result: BitcoinAddresses.isAddressValid(address) };
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_isAddressValid`);
        }
    }

    isAddressValidForSending(address) {
        try {
            return PaymentService.isAddressValidForSending(address);
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_isAddressValidForSending`);
        }
    }

    async createTransactionsWithFakeSignatures(
        address,
        coinAmount,
        isSendAll,
        currentNetwork,
        balanceCoins,
        isAddressFake = false
    ) {
        try {
            return await PaymentService.createTransactionsWithFakeSignatures(
                address,
                coinAmount,
                isSendAll,
                currentNetwork
            );
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_createTransactionsWithFakeSignatures`);
        }
    }

    async createTransactionAndBroadcast(mnemonic, passphrase, txData) {
        try {
            return await PaymentService.createTransactionAndBroadcast(mnemonic, passphrase, txData);
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_createTransactionAndBroadcast`);
        }
    }

    async createNewAddress(label) {
        try {
            return await AddressesService.createNewExternalAddress(label);
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_createNewAddress`);
        }
    }

    async exportWalletData(password) {
        try {
            return await AddressesServiceInternal.exportAddressesWithPrivateKeysByPassword(password);
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_exportWalletData`);
        }
    }

    actualizeLocalCachesWithNewTransactionData(sentCoin, txData, txId) {
        try {
            const tx = Transaction.fromTxData(txData, txId);
            transactionsDataProvider.updateTransactionsCache([tx]);
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_actualizeLocalCachesWithNewTransactionData`);
        }
    }

    markBalanceCacheAsExpired() {
        try {
            BalanceService.markBtcBalanceCacheAsExpired();
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_markBalanceCacheAsExpired`);
        }
    }

    actualizeBalanceCacheWithAmountAtoms(amountAtoms, sign = -1) {
        try {
            BalanceService.actualizeBalanceCacheWithAmountAtoms(amountAtoms, sign);
        } catch (e) {
            improveAndRethrow(e, "actualizeBalanceCacheWithAmountAtoms");
        }
    }

    markTransactionsCacheAsExpired() {
        try {
            transactionsDataProvider.markDataAsExpired();
        } catch (e) {
            improveAndRethrow(e, "markTransactionsCacheAsExpired");
        }
    }

    async getCurrentChangeAddressIfSupported() {
        return await AddressesService.getCurrentChangeAddress();
    }
}

/**
 * WARNING: we use singleton wallet objects all over the app. Don't create custom instances.
 */
export const bitcoinWallet = new BitcoinWallet();
