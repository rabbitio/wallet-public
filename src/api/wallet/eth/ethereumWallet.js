import { ethers } from "ethers";

import { improveAndRethrow } from "@rabbitio/ui-kit";

import { Wallet } from "../common/models/wallet.js";
import { ethereum } from "./ethereum.js";
import { EthBalanceService } from "./services/ethBalanceService.js";
import { EthereumTransactionsHistoryService } from "./services/ethereumTransactionsHistoryService.js";
import { EthTransactionDetailsService } from "./services/ethTransactionDetailsService.js";
import { EthAddressesService } from "./services/ethAddressesService.js";
import { EthSendTransactionService } from "./services/ethSendTransactionService.js";
import { EthTransactionsProvider } from "./external-apis/ethTransactionsProvider.js";

class EthereumWallet extends Wallet {
    constructor() {
        super(ethereum, false);
    }

    async calculateBalance() {
        try {
            return await EthBalanceService.getEthWalletBalance();
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_calculateBalance`);
        }
    }

    async getTransactionsList() {
        try {
            return await EthereumTransactionsHistoryService.getEthereumTransactionsHistory(this.coin);
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_getTransactionsList`);
        }
    }

    async getTransactionDetails(txId, transactionType = null) {
        try {
            return await EthTransactionDetailsService.getEthereumBlockchainTransactionDetails(
                this.coin,
                txId,
                transactionType
            );
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_getTransactionDetails`);
        }
    }

    async isTxBelongingToWalletsCoin(txId) {
        try {
            return await EthTransactionDetailsService.isTransactionBelongingToEthereumCoin(this.coin, txId);
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_isTxBelongingToWalletsCoin`);
        }
    }

    async getCurrentAddress() {
        try {
            return EthAddressesService.getCurrentEthAddress();
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_getCurrentAddress`);
        }
    }

    isAddressValid(address) {
        try {
            return { result: ethers.utils.isAddress(address) };
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_isAddressValid`);
        }
    }

    isAddressValidForSending(address) {
        try {
            return { result: ethers.utils.isAddress(address) };
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
            return await EthSendTransactionService.createEthereumBlockchainCoinTransactionsWithFakeSignatures(
                ethereum,
                address,
                coinAmount,
                isSendAll,
                currentNetwork,
                balanceCoins
            );
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_createTransactionsWithFakeSignatures`);
        }
    }

    async createTransactionAndBroadcast(mnemonic, passphrase, txData) {
        try {
            return await EthSendTransactionService.createEthTransactionAndBroadcast(
                ethereum,
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
            return EthAddressesService.exportAddressesWithPrivateKeys(password);
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_exportWalletData`);
        }
    }

    actualizeLocalCachesWithNewTransactionData(sentCoin, txData, txId) {
        try {
            const address = EthAddressesService.getCurrentEthAddress();
            EthTransactionsProvider.actualizeCacheWithNewTransactionSentFromAddress(address, txData, txId);
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_actualizeLocalCachesWithNewTransactionData`);
        }
    }

    markBalanceCacheAsExpired() {
        try {
            EthBalanceService.markEtherBalanceCacheAsExpired();
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_markBalanceCacheAsExpired`);
        }
    }

    actualizeBalanceCacheWithAmountAtoms(amountAtoms, sign = -1) {
        try {
            EthBalanceService.actualizeBalanceCacheWithAmountAtoms(amountAtoms, sign);
        } catch (e) {
            improveAndRethrow(e, "actualizeBalanceCacheWithAmountAtoms");
        }
    }

    markTransactionsCacheAsExpired() {
        try {
            const address = EthAddressesService.getCurrentEthAddress();
            EthTransactionsProvider.markCacheAsExpired(address);
        } catch (e) {
            improveAndRethrow(e, "markTransactionsCacheAsExpired");
        }
    }
}

/**
 * WARNING: we use singleton coins objects all over the app. Don't create custom instances.
 */
export const ethereumWallet = new EthereumWallet();
