import { Wallet } from "../../common/models/wallet";
import { TronBlockchainBalancesService } from "../../trx/services/tronBlockchainBalancesService";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { TrxAddressesService } from "../../trx/services/trxAddressesService";
import { validateTronAddress } from "../../trx/lib/addresses";
import { Trc20TransactionsHistoryService } from "../services/trc20TransactionsHistoryService";
import { Trc20TransactionsProvider } from "../external-apis/trc20TransactionsProvider";
import { TronTransactionDetailsService } from "../../trx/services/tronTransactionDetailsService";
import { TronSendTransactionService } from "../../trx/services/tronSendTransactionService";
import { getCurrentNetwork } from "../../../common/services/internal/storage";

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
                getCurrentNetwork(this.coin),
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
