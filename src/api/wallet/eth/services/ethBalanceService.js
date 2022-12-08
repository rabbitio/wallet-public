import { ethers } from "ethers";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { EthAddressesService } from "./ethAddressesService";
import { EthBalanceProvider } from "../external-apis/ethBalanceProvider";

// TODO: [tests, critical] implement some units/integration tests
export class EthBalanceService {
    /**
     * Retrieves balance for current ether wallet
     * @returns {Promise<string>} balance in Ether string
     */
    static async getEthWalletBalance() {
        try {
            const address = EthAddressesService.getCurrentEthAddress();
            const weiBalance = await EthBalanceProvider.getEthBalanceForAddress(address);
            return ethers.utils.formatEther(weiBalance);
        } catch (e) {
            improveAndRethrow(e, "getEthWalletBalance");
        }
    }
}
