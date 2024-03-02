import { ethers } from "ethers";

import { improveAndRethrow } from "@rabbitio/ui-kit";

import { Wallet } from "../../common/models/wallet.js";
import { Erc20TokenBalanceService } from "../services/erc20TokenBalanceService.js";
import { Erc20TokenTransactionDetailsService } from "../services/erc20TokenTransactionDetailsService.js";
import { EthAddressesService } from "../../eth/services/ethAddressesService.js";
import { Erc20TokenSendTransactionService } from "../services/erc20TokenSendTransactionService.js";
import { EthSendTransactionService } from "../../eth/services/ethSendTransactionService.js";
import { Erc20TransactionsProvider } from "../external-apis/erc20TransactionsProvider.js";
import { EthereumTransactionsHistoryService } from "../../eth/services/ethereumTransactionsHistoryService.js";

export class Erc20TokenWallet extends Wallet {
    /**
     * WARNING: we use singleton wallet objects all over the app. Don't create custom instances.
     */
    constructor(coin) {
        super(coin, false);
    }

    async calculateBalance() {
        try {
            return await Erc20TokenBalanceService.calculateBalance(this.coin);
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
            return await Erc20TokenTransactionDetailsService.getErc20TransactionDetails(
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
            return await Erc20TokenTransactionDetailsService.doesTxBelongToErc20Token(this.coin, txId);
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
            return await Erc20TokenSendTransactionService.createErc20TransactionsWithFakeSignatures(
                this.coin,
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
            return EthAddressesService.exportAddressesWithPrivateKeys(password);
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_exportWalletData`);
        }
    }

    actualizeLocalCachesWithNewTransactionData(sentCoin, txData, txId) {
        try {
            const address = EthAddressesService.getCurrentEthAddress();
            Erc20TransactionsProvider.actualizeCacheWithNewTransaction(sentCoin, address, txData, txId);
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_actualizeLocalCachesWithNewTransactionData`);
        }
    }

    markBalanceCacheAsExpired() {
        try {
            Erc20TokenBalanceService.markErc20TokenBalanceAsExpired(this.coin);
        } catch (e) {
            improveAndRethrow(e, `${this.coin.ticker}_markBalanceCacheAsExpired`);
        }
    }

    actualizeBalanceCacheWithAmountAtoms(amountAtoms, sign = -1) {
        try {
            Erc20TokenBalanceService.actualizeBalanceCacheWithAmountAtoms(this.coin, amountAtoms, sign);
        } catch (e) {
            improveAndRethrow(e, "actualizeBalanceCacheWithAmountAtoms");
        }
    }

    markTransactionsCacheAsExpired() {
        try {
            const address = EthAddressesService.getCurrentEthAddress();
            Erc20TransactionsProvider.markCacheAsExpired(address);
        } catch (e) {
            improveAndRethrow(e, "markTransactionsCacheAsExpired");
        }
    }
}
