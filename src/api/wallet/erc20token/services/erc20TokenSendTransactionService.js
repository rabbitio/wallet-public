import { improveAndRethrow } from "@rabbitio/ui-kit";

import { Erc20FeeEstimationService } from "./erc20FeeEstimationService.js";
import { EthSendTransactionService } from "../../eth/services/ethSendTransactionService.js";
import { EthAddressesService } from "../../eth/services/ethAddressesService.js";

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
     * @param balanceCoins {string} balance of sending coin
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
            coinAmount = isSendAll ? balanceCoins : coinAmount;
            const gasIntString = await Erc20FeeEstimationService.estimateGasForTransfer(
                coin,
                senderAddress,
                address,
                coin.coinAmountToAtoms(coinAmount),
                network
            );
            return await EthSendTransactionService.createEthereumBlockchainCoinTransactionsWithFakeSignatures(
                coin,
                address,
                coinAmount,
                isSendAll,
                network,
                balanceCoins,
                gasIntString
            );
        } catch (e) {
            improveAndRethrow(e, "createEthTransactionsWithFakeSignatures");
        }
    }
}
