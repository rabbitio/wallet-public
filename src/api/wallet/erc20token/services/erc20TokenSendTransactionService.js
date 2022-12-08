import { BigNumber, ethers } from "ethers";

import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { Logger } from "../../../support/services/internal/logs/logger";
import { getCurrentNetwork } from "../../../common/services/internal/storage";
import { Erc20Providers } from "../external-apis/erc20TokenProvider";
import {
    EthSendTransactionService,
    tryToGetDeterminedErrorFromEtherSendError,
} from "../../eth/services/ethSendTransactionService";
import { EthAddressesService } from "../../eth/services/ethAddressesService";

export class Erc20TokenSendTransactionService {
    /**
     * Validates address and amount and tries to create transactions for 4 speed options with fake signatures
     * Composes TxData ready for sending for further usage if all is ok.
     *
     * @param coin {Coin} token Coin object
     * @param address {string} address to be validated
     * @param coinAmount {string} amount to be validated in coin denomination
     * @param isSendAll {boolean} whether transaction should send all available coins or not
     * @param network {Network} coin to create the fake ttx for
     * @param balanceCoins {number|string} balance of sending coin
     * @return {Promise<
     *         {
     *             result: true,
     *             txsDataArray:
     *                 TxData[]
     *                 |
     *                 {
     *                     errorDescription: string,
     *                     howToFix: string
     *                 }[]
     *         }
     *         |
     *         {
     *             result: false,
     *             errorDescription: string,
     *             howToFix: string
     *         }>}
     */
    static async createErc20TransactionsWithFakeSignatures(
        coin,
        address,
        coinAmount,
        isSendAll,
        network,
        balanceCoins
    ) {
        try {
            const senderAddress = EthAddressesService.getCurrentEthAddress();
            const gasIntString = await Erc20Providers.getProviderByCoin(coin).estimateGasForTransfer(
                senderAddress,
                address,
                coin.coinAmountToAtoms(coinAmount),
                network
            );
            const gasUnitsRequired = BigNumber.from(Math.round(gasIntString) + "");

            return await EthSendTransactionService.createEthereumBlockchainCoinTransactionsWithFakeSignatures(
                coin,
                address,
                coinAmount,
                isSendAll,
                network,
                balanceCoins,
                gasUnitsRequired
            );
        } catch (e) {
            improveAndRethrow(e, "createEthTransactionsWithFakeSignatures");
        }
    }

    /**
     * @deprecated as we cannot specify fee option when calling transfer on the contract object provided by ethers.
     *
     * Creates transaction and broadcasts it to the network. Saves its description if present on successful broadcasting.
     *
     * @param coin {Coin} token to be sent
     * @param mnemonic {string} mnemonic words of this wallet
     * @param passphrase {string} passphrase string of this wallet
     * @param txData {TxData} data to create transaction
     * @return {Promise<string|{ errorDescription: string, howToFix: string }>} resolving to transaction id of transaction
     *         appeared in the blockchain or to a determined error object
     */
    static async createErc20TransactionAndBroadcast(coin, mnemonic, passphrase, txData) {
        try {
            const network = getCurrentNetwork(coin);
            const provider = Erc20Providers.getProviderByCoin(coin);
            const rwContract = await provider.createRWContract(mnemonic, passphrase, network);

            let sentTx;
            try {
                // WARNING: We don't pass the fee option here, it is just ignored
                sentTx = await rwContract.transfer(txData.address, ethers.BigNumber.from(txData.amount));
            } catch (e) {
                Logger.log("Failed to send ERC20 tx. Trying to extract determined error from " + JSON.stringify(e));
                const determinedError = tryToGetDeterminedErrorFromEtherSendError(e);
                if (determinedError) return determinedError;
                throw e;
            }

            if (!sentTx.hash) {
                throw new Error("Sent ether tx has null hash: " + JSON.stringify(sentTx));
            }

            Logger.log("Successfully sent a ether transaction: " + JSON.stringify(sentTx.hash));
            return sentTx.hash;
        } catch (e) {
            Logger.log("Failed to send erc20 transaction: " + coin.ticker + JSON.stringify(e));
            improveAndRethrow(e, "createErc20TransactionAndBroadcast");
        }
    }
}
