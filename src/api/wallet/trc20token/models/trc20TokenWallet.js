import { improveAndRethrow } from "@rabbitio/ui-kit";

import { Wallet } from "../../common/models/wallet.js";
import { TronBlockchainBalancesService } from "../../trx/services/tronBlockchainBalancesService.js";
import { TrxAddressesService } from "../../trx/services/trxAddressesService.js";
import { validateTronAddress } from "../../trx/lib/addresses.js";
import { Trc20TransactionsHistoryService } from "../services/trc20TransactionsHistoryService.js";
import { Trc20TransactionsProvider } from "../external-apis/trc20TransactionsProvider.js";
import { TronTransactionDetailsService } from "../../trx/services/tronTransactionDetailsService.js";
import { TronSendTransactionService } from "../../trx/services/tronSendTransactionService.js";
import { Storage } from "../../../common/services/internal/storage.js";

export class Trc20TokenWallet extends Wallet {
    /**
     * WARNING: we use singleton wallet objects all over the app. Don't create custom instances.
     */
    constructor(coin) {
        super(coin, false);
    }

    async calculateBalance() {
        try {
            return await TronBlockchainBalancesService.getBalance(this.coin);
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_calculateBalance`);
        }
    }

    async getTransactionsList() {
        try {
            return await Trc20TransactionsHistoryService.getTrc20TokenTransactionsHistory(this.coin);
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
            return { result: validateTronAddress(address) };
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
            Trc20TransactionsProvider.actualizeCacheWithNewTransaction(this.coin, address, txData, txId);
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
            Trc20TransactionsProvider.markCacheAsExpired(address);
        } catch (e) {
            improveAndRethrow(e, "markTransactionsCacheAsExpired");
        }
    }
}
