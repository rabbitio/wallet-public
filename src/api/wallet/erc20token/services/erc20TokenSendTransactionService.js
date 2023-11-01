import { BigNumber } from "ethers";

import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { Erc20FeeEstimationService } from "./erc20FeeEstimationService";
import { EthSendTransactionService } from "../../eth/services/ethSendTransactionService";
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
            // TODO: [feature, critical] use balance atoms to avoid potential overflow. task_id=825b0eace30c4a78bd30c90569d10d84
            coinAmount = isSendAll ? balanceCoins : coinAmount;
            const gasIntString = await Erc20FeeEstimationService.estimateGasForTransfer(
                coin,
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
}
