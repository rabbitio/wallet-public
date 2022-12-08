import { ethers } from "ethers";
import { Wallet } from "../../common/models/wallet";
import { usdtErc20 } from "./usdtErc20";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { Erc20TokenBalanceService } from "../services/erc20TokenBalanceService";
import { Erc20TokenTransactionsHistoryService } from "../services/erc20TokenTransactionsHistoryService";
import { Erc20TokenTransactionDetailsService } from "../services/erc20TokenTransactionDetailsService";
import { EthAddressesService } from "../../eth/services/ethAddressesService";
import { Erc20TokenSendTransactionService } from "../services/erc20TokenSendTransactionService";
import { EthSendTransactionService } from "../../eth/services/ethSendTransactionService";

class UsdtErc20Wallet extends Wallet {
    constructor() {
        super(usdtErc20, false);
    }

    async calculateBalance() {
        try {
            return await Erc20TokenBalanceService.calculateBalance(usdtErc20);
        } catch (e) {
            improveAndRethrow(e, "calculateBalance");
        }
    }

    async getTransactionsList() {
        try {
            return await Erc20TokenTransactionsHistoryService.getTransactionsList(usdtErc20);
        } catch (e) {
            improveAndRethrow(e, "getTransactionsList");
        }
    }

    async getTransactionDetails(txId) {
        try {
            return await Erc20TokenTransactionDetailsService.getErc20TransactionDetails(usdtErc20, txId);
        } catch (e) {
            improveAndRethrow(e, "getTransactionDetails");
        }
    }

    async isTxBelongingToWalletsCoin(txId) {
        try {
            return await Erc20TokenTransactionDetailsService.doesTxBelongToErc20Token(usdtErc20, txId);
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
            return await Erc20TokenSendTransactionService.createErc20TransactionsWithFakeSignatures(
                usdtErc20,
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
                usdtErc20,
                mnemonic,
                passphrase,
                txData
            );
        } catch (e) {
            improveAndRethrow(e, "createTransactionAndBroadcast");
        }
    }

    async createNewAddress(label) {
        throw new Error("New address creation is not supported for " + usdtErc20.ticker);
    }

    async exportWalletData(password) {
        try {
            return EthAddressesService.exportAddressesWithPrivateKeys(password);
        } catch (e) {
            improveAndRethrow(e, "exportWalletData");
        }
    }
}

export const usdtErc20Wallet = new UsdtErc20Wallet();
