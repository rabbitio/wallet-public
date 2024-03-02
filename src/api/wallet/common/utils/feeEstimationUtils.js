import { TRC20 } from "../../trc20token/trc20Protocol.js";
import { ERC20 } from "../../erc20token/erc20Protocol.js";

export class FeeEstimationUtils {
    /**
     * Estimation can fail if there is not enough ETH/TRX on the sender's account.
     * So we created static wallet having some coins in corresponding blockchains and use their addresses as "from"
     * addresses when estimating transfers of tokens.
     *
     * This is ok as the addresses usually have the same length for the same blockchain so technically using
     * not original sender's address most likely will not affect the fee. But if you add another blockchains here you
     * should make sure this hypothesis is true for adding blockchain.
     *
     * You can find details of these wallets in project's credentials database.
     *
     * Note that current mentioned addresses have coins for both mainnets and testnets mentioned below.
     * @param protocol {Protocol}
     * @return {string} address
     */
    static getWalletAddressToUseAsFromAddressForTokenSendingEstimation(protocol) {
        if (protocol === TRC20) {
            return "TD4j8oaQFcUFwDjn2dthCJXUY19yvfhmHz"; // Has mainnet and testnet (nile) TRX
        }
        if (protocol === ERC20) {
            return "0x71538cae72716738f59dbedcce3dda3a183de8aa"; // Has mainnet and testnet (goerli) ETH and USDT ERC20
        }
        throw new Error("Protocol is not supported: " + protocol);
    }
}
