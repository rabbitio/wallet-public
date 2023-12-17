import { BigNumber } from "ethers";
import { logError } from "../../../common/utils/errorUtils";
import { Logger } from "../../../support/services/internal/logs/logger";
import { Erc20transactionUtils } from "../lib/erc20transactionUtils";
import { FeeEstimationUtils } from "../../common/utils/feeEstimationUtils";
import { safeStringify } from "../../../common/utils/browserUtils";
import { Erc20TransactionFeeEstimationProvider } from "../external-apis/erc20transactionFeeEstimationProvider";
import { ERC20 } from "../erc20Protocol";

export class Erc20FeeEstimationService {
    /**
     * Estimates gas amount required to send a transaction with given receiver and amount.
     * Note that if there is not enough funds on the sending wallet we will try to estimate for hardcoded wallet address
     * as a sender, but it can provide a wrong estimation.
     * If all attempts fail we return the default gas limit that will with a high probability cover ERC20 transfer transaction.
     *
     * None default estimations are increased with X% to make sure the tx will not be declined.
     *
     * TODO: [tests, critical] payments logic
     *
     * @param token {Coin} ERC20 token you are planning to send
     * @param sender {string} the address sending tokens
     * @param receiver {string} address to send tokens to
     * @param amountAtoms {string} amount of token atoms to send
     * @param network {Network} to work in
     * @return {Promise<number>} integer number of gas units
     */
    static async estimateGasForTransfer(token, sender, receiver, amountAtoms, network) {
        const loggerSource = "estimateGasForTransfer";

        /* Default max gas amount is discovered empirically and by accumulating the amounts used by other apps/services.
         * This value affects the estimation call itself (its free but enough gas amount should be mentioned) and also
         * affects the final transaction a user will send if the estimation call fails as we use this amount as default
         * gas limit for error cases so if you set this amount for relatively big value the end user can face really
         * high fee estimation.
         * But the same time if the specific contract execution requires more gas than this value, and we use this default
         * value than the sending using this amount will fail with ~"out of gas" error. So change this value carefully
         * and assume all the restrictions.
         */
        const defaultMaxGasAmountForErc20Transfer = 120000;

        try {
            const dataHex = Erc20transactionUtils.composeEthereumTransactionDataForGivenParams(receiver, amountAtoms);
            let gasLimit;
            try {
                const gasBigNumber = await Erc20TransactionFeeEstimationProvider.getErc20TransferFeeEstimation(
                    sender,
                    token.tokenAddress,
                    dataHex,
                    defaultMaxGasAmountForErc20Transfer
                );
                if (!gasBigNumber instanceof BigNumber) {
                    throw new Error("Wrong gas erc20 estimation: " + gasBigNumber);
                }
                gasLimit = gasBigNumber.toString();
            } catch (e) {
                Logger.log(`Failed to estimate gas (we will retry): ${safeStringify(e)}`, loggerSource);
                const res2 = await Erc20TransactionFeeEstimationProvider.getErc20TransferFeeEstimation(
                    FeeEstimationUtils.getWalletAddressToUseAsFromAddressForTokenSendingEstimation(ERC20),
                    token.tokenAddress,
                    dataHex,
                    defaultMaxGasAmountForErc20Transfer
                );
                gasLimit = res2.toString();
            }

            if (!gasLimit || !+gasLimit) {
                Logger.log(`Gas limit is not retrieved: ${gasLimit}`, loggerSource);
            } else {
                Logger.log(`Correct gas estimation retrieved: ${gasLimit}`, loggerSource);
            }

            /* We are converting retrieved number from hex to decimal and increasing it with the predefined percent
             * to ensure the limit is enough to cover the transaction. This is useful as sometime the estimation returns
             * too low gas amount and the later transaction sending fails with such a low gas limit.
             *
             * NOTE: this increased limit the other way affects the ability to send all coins from the wallet. But
             * it still looks like a reasonable tradeoff.
             */
            const percentToIncreaseEstimation = 25;
            let finalValue = BigNumber.from(gasLimit).toNumber() * ((100 + percentToIncreaseEstimation) / 100);

            /* We use also min gas limit as for some weird reason rarely ethereum provides significantly inaccurate
             * estimations and transaction sending using this limit fails due to OUT_OF_GAS.
             * This constant is just empirically discovered value that should with high probability fit the actual gas
             * amount required to perform erc20 transfer.
             */
            const minEmpiricalGasLimit = 69000;
            if (finalValue < minEmpiricalGasLimit) {
                finalValue = minEmpiricalGasLimit;
                Logger.log(`Returning min empirical gas limit as the estimation is small: ${finalValue}`, loggerSource);
            } else {
                Logger.log(`Returning gas limit increased with predefined percent: ${finalValue}`, loggerSource);
            }

            Logger.log(`Increased gas limit estimation with predefined percent: ${finalValue}`, loggerSource);
            return finalValue;
        } catch (e) {
            logError(e, "estimateGasForTransfer");
            Logger.log(`estimateGas failed for ERC20 for ${sender}->${receiver}:${amountAtoms}. ${JSON.stringify(e)}`);
            return defaultMaxGasAmountForErc20Transfer;
        }
    }
}
