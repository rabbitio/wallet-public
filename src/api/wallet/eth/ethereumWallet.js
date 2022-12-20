import { ethers } from "ethers";
import { Wallet } from "../common/models/wallet";
import { ethereum } from "./ethereum";
import { improveAndRethrow } from "../../common/utils/errorUtils";
import { EthBalanceService } from "./services/ethBalanceService";
import { EthTransactionsHistoryService } from "./services/ethTransactionsHistoryService";
import { EthTransactionDetailsService } from "./services/ethTransactionDetailsService";
import { EthAddressesService } from "./services/ethAddressesService";
import { EthSendTransactionService } from "./services/ethSendTransactionService";
import { EthTransactionsProvider } from "./external-apis/ethTransactionsProvider";

class EthereumWallet extends Wallet {
    constructor() {
        super(ethereum, false);
    }

    async calculateBalance() {
        try {
            return await EthBalanceService.getEthWalletBalance();
        } catch (e) {
            improveAndRethrow(e, "calculateBalance");
        }
    }

    async getTransactionsList() {
        try {
            return await EthTransactionsHistoryService.getEthTransactionsHistory();
        } catch (e) {
            improveAndRethrow(e, "getTransactionsList");
        }
    }

    async getTransactionDetails(txId) {
        try {
            return await EthTransactionDetailsService.getEthTransactionDetails(txId);
        } catch (e) {
            improveAndRethrow(e, "getTransactionDetails");
        }
    }

    async isTxBelongingToWalletsCoin(txId) {
        try {
            return await EthTransactionDetailsService.isTransactionBelongsToEther(txId);
        } catch (e) {
            improveAndRethrow(e, "isTxBelongingToWalletsCoin");
        }
    }

    async getCurrentAddress() {
        try {
            return EthAddressesService.getCurrentEthAddress();
        } catch (e) {
            improveAndRethrow(e, "getCurrentAddress");
        }
    }

    isAddressValid(address) {
        try {
            return { result: ethers.utils.isAddress(address) };
        } catch (e) {
            improveAndRethrow(e, "isAddressValid");
        }
    }

    async createTransactionsWithFakeSignatures(address, coinAmount, isSendAll, currentNetwork, balanceCoins) {
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
            improveAndRethrow(e, "createTransactionsWithFakeSignatures");
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
            improveAndRethrow(e, "createTransactionAndBroadcast");
        }
    }

    async createNewAddress(label) {
        throw new Error("New address creation is not supported for " + ethereum.ticker);
    }

    async exportWalletData(password) {
        try {
            return EthAddressesService.exportAddressesWithPrivateKeys(password);
        } catch (e) {
            improveAndRethrow(e, "exportWalletData");
        }
    }

    actualizeLocalCachesWithNewTransactionData(sentCoin, txData, txId) {
        try {
            const address = EthAddressesService.getCurrentEthAddress();
            EthTransactionsProvider.actualizeCacheWithNewTransactionSentFromAddress(address, txData, txId);
        } catch (e) {
            improveAndRethrow(e, "actualizeLocalCachesWithNewTransactionData");
        }
    }
}

export const ethereumWallet = new EthereumWallet();
