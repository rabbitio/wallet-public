import { BigNumber, ethers } from "ethers";
import { EthQueryAdapter } from "../adapters/ethQueryAdapter";
import erc20abi from "./../lib/erc20abi.json";
import { ETH_PR_K } from "../../../../properties";
import { getCurrentNetwork } from "../../../common/services/internal/storage";
import { improveAndRethrow, logError } from "../../../common/utils/errorUtils";
import { Coins } from "../../coins";
import { EthKeys } from "../../eth/lib/ethKeys";
import { Logger } from "../../../support/services/internal/logs/logger";
import { Erc20transactionUtils } from "../lib/erc20transactionUtils";

class Erc20TokenTransactionsDataProvider {
    constructor(coin) {
        this.tokenAddress = coin.tokenAddress;
        this._provider = new ethers.providers.AlchemyProvider(getCurrentNetwork(coin).key, ETH_PR_K);
        this._contract = new ethers.Contract(coin.tokenAddress, erc20abi, this._provider);
    }

    createRWContract(mnemonic, passphrase, network) {
        return this._createRwContract(mnemonic, passphrase, network);
    }

    // TODO: [tests, critical] docs, tests
    _createRwContract(mnemonic, passphrase, network) {
        try {
            const { privateKey } = EthKeys.generateKeysForAccountAddressByWalletCredentials(
                mnemonic,
                passphrase,
                network
            );
            const wallet = new ethers.Wallet(privateKey).connect(this._provider);
            return new ethers.Contract(this.tokenAddress, erc20abi, wallet);
        } catch (e) {
            improveAndRethrow(e, "createRWContract");
        }
    }
    /**
     * Returns balance for this token and given address
     * @param accountAddress {string} token address to get the balance for
     * @returns {Promise<string>} balance string in coin's atoms
     */
    async getBalanceByAccountAddress(accountAddress) {
        try {
            return (await this._contract.balanceOf(accountAddress)).toString();
        } catch (e) {
            improveAndRethrow(e, "getBalanceByAccountAddress");
        }
    }

    /**
     * @deprecated as requires mnemonic, found a solution without need to disclose credentials
     *
     * Estimates gas amount required to send a transaction with given receiver and amount.
     * NOTE: this method works only with real mnemonic and passphrase of the address owner.
     *
     * @param mnemonic {string} mnemonic of this wallet
     * @param passphrase {string} passphrase of wallet or empty string
     * @param receiver {string} address to send tokens to
     * @param amountAtoms {string} amount of token atoms to send
     * @param network {Network} to work in
     * @return {Promise<String>} number of gas units as a string
     */
    async estimateGas(mnemonic, passphrase, receiver, amountAtoms, network) {
        try {
            const rwContract = this._createRwContract(mnemonic, passphrase, network);
            const gasBigNumber = await rwContract.estimateGas.transfer(receiver, BigNumber.from(amountAtoms));
            return gasBigNumber ? gasBigNumber.toString() : null;
        } catch (e) {
            improveAndRethrow(e, "estimateGas");
        }
    }

    /**
     * Estimates gas amount required to send a transaction with given receiver and amount.
     * Note that if there is not enough funds on the sending wallet we will try to estimate for hardcoded wallet address
     * as a sender, but it can provide a wrong estimation.
     * If all attempts fail we return the default gas limit that will with a high probability cover ERC20 transfer transaction.
     *
     * None default estimations are increased with 15% to make sure the tx will not be declined.
     *
     * TODO: [tests, critical] payments logic
     *
     * @param sender {string} the address sending tokens
     * @param receiver {string} address to send tokens to
     * @param amountAtoms {string} amount of token atoms to send
     * @param network {Network} to work in
     * @return {Promise<number>} integer number of gas units
     */
    async estimateGasForTransfer(sender, receiver, amountAtoms, network) {
        const defaultMaxGasAmountForErc20Transfer = 120000;
        try {
            const data = Erc20transactionUtils.composeEthereumTransactionDataForGivenParams(receiver, amountAtoms);
            const providerUrl = `https://eth-${network.key}.alchemyapi.io/v2/${ETH_PR_K}`; // TODO: [feature, critical] Use network-dependent key
            const transactionData = {
                from: sender,
                to: this.tokenAddress,
                gas: "0x" + defaultMaxGasAmountForErc20Transfer.toString(16),
                value: "0x0",
                data: data,
            };
            let gasLimitHex;
            try {
                gasLimitHex = await EthQueryAdapter.query(providerUrl, "estimateGas", [transactionData]);
            } catch (e) {
                logError(e, "estimateGasForTransfer");
                /**
                 * Estimation can fail if there is not enough ETH on the "sender"'s account.
                 * So here we are trying to estimate using the hardcoded wallet having ETH for fee estimation.
                 * Find its details in project's credentials database. This can provide not so accurate estimation, but
                 * it is better than nothing.
                 * NOTE: this hardcoded account should have at least sending USDT amount and amount to cover max gas.
                 * That means for rare cases of high gas prices you need to have some significant amount like 50-100 USD equialent of ETH.
                 */
                transactionData.from = "0x71538cae72716738f59dbedcce3dda3a183de8aa";
                gasLimitHex = await EthQueryAdapter.query(providerUrl, "estimateGas", [transactionData]);
            }

            if (!gasLimitHex || !+gasLimitHex) {
                Logger.log(`Gas limit is not retrieved: ${gasLimitHex}`);
            }

            return +(+gasLimitHex).toString(10) * 1.15;
        } catch (e) {
            logError(e, "estimateGasForTransfer");
            Logger.log(`estimateGas failed for ERC20 for ${sender}->${receiver}:${amountAtoms}. ${JSON.stringify(e)}`);
            return defaultMaxGasAmountForErc20Transfer;
        }
    }
}

export class Erc20Providers {
    static _providers = Coins.getSupportedCoinsList()
        .filter(coin => coin.tokenAddress)
        .map(coin => new Erc20TokenTransactionsDataProvider(coin));

    static getProviderByCoin(coin) {
        return this._providers.find(
            provider => provider.tokenAddress.toLowerCase() === coin.tokenAddress.toLowerCase()
        );
    }
}
