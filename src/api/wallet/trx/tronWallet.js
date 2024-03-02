import { improveAndRethrow } from "@rabbitio/ui-kit";

import { Wallet } from "../common/models/wallet.js";
import { tron } from "./tron.js";
import { TrxAddressesService } from "./services/trxAddressesService.js";
import { TronTransactionsHistoryService } from "./services/tronTransactionsHistoryService.js";
import { TronBlockchainBalancesService } from "./services/tronBlockchainBalancesService.js";
import { TronTransactionsProvider } from "./external-apis/tronTransactionsProvider.js";
import { TronTransactionDetailsService } from "./services/tronTransactionDetailsService.js";
import { TronSendTransactionService } from "./services/tronSendTransactionService.js";
import { Storage } from "../../common/services/internal/storage.js";
import { validateTronAddress } from "./lib/addresses.js";

class TronWallet extends Wallet {
    constructor() {
        super(tron, false);
    }

    async calculateBalance() {
        try {
            return await TronBlockchainBalancesService.getBalance(tron);
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_calculateBalance`);
        }
    }

    async getTransactionsList() {
        try {
            return await TronTransactionsHistoryService.getTrxTransactionsHistory();
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_getTransactionsList`);
        }
    }

    async getTransactionDetails(txId, transactionType = null) {
        try {
            return await TronTransactionDetailsService.getTronTransactionDetails(this.coin, txId, transactionType);
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_getTransactionDetails`);
        }
    }

    async isTxBelongingToWalletsCoin(txId) {
        try {
            return await TronTransactionDetailsService.isTxBelongsToTronNetwork(this.coin, txId);
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_isTxBelongingToWalletsCoin`);
        }
    }

    async getCurrentAddress() {
        try {
            return TrxAddressesService.getCurrentTrxAddress();
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_getCurrentAddress`);
        }
    }

    isAddressValid(address) {
        try {
            return { result: validateTronAddress(address) };
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_isAddressValid`);
        }
    }

    isAddressValidForSending(address) {
        try {
            return TronSendTransactionService.validateAddressForSending(address);
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
            return await TronSendTransactionService.createTronBlockchainCoinTransactionsWithFakeSignatures(
                this.coin,
                address,
                coinAmount,
                isSendAll,
                Storage.getCurrentNetwork(this.coin),
                balanceCoins,
                isAddressFake
            );
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_createTransactionsWithFakeSignatures`);
        }
    }

    async createTransactionAndBroadcast(mnemonic, passphrase, txData) {
        try {
            return await TronSendTransactionService.createTronBlockchainTransactionAndBroadcast(
                this.coin,
                mnemonic,
                passphrase,
                txData
            );
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_createTransactionAndBroadcast`);
        }
    }

    async exportWalletData(password) {
        try {
            return TrxAddressesService.exportAddressesWithPrivateKeys(password);
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_exportWalletData`);
        }
    }

    actualizeLocalCachesWithNewTransactionData(sentCoin, txData, txId) {
        try {
            const address = TrxAddressesService.getCurrentTrxAddress();
            TronTransactionsProvider.actualizeCacheWithNewTransaction(this.coin, address, txData, txId);
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_actualizeLocalCachesWithNewTransactionData`);
        }
    }

    markBalanceCacheAsExpired() {
        try {
            TronBlockchainBalancesService.markBalancesAsExpired(this.coin);
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_markBalanceCacheAsExpired`);
        }
    }

    actualizeBalanceCacheWithAmountAtoms(amountAtoms, sign = -1) {
        try {
            TronBlockchainBalancesService.actualizeBalanceCacheWithAmountAtomsForCoin(this.coin, amountAtoms, sign);
        } catch (e) {
            improveAndRethrow(e, "actualizeBalanceCacheWithAmountAtoms");
        }
    }

    markTransactionsCacheAsExpired() {
        try {
            const address = TrxAddressesService.getCurrentTrxAddress();
            TronTransactionsProvider.markCacheAsExpired(address);
        } catch (e) {
            improveAndRethrow(e, "markTransactionsCacheAsExpired");
        }
    }
}

/**
 * WARNING: we use singleton coins objects all over the app. Don't create custom instances.
 */
export const tronWallet = new TronWallet();
