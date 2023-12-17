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
import { isAddressValid } from "./lib/addresses";

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
            return { result: isAddressValid(address) };
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
