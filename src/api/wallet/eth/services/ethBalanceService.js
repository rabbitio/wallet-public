import { ethers } from "ethers";

import { improveAndRethrow } from "@rabbitio/ui-kit";

import { EthAddressesService } from "./ethAddressesService.js";
import { EthBalanceProvider } from "../external-apis/ethBalanceProvider.js";

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

    static markEtherBalanceCacheAsExpired() {
        try {
            const address = EthAddressesService.getCurrentEthAddress();
            EthBalanceProvider.markEthBalanceCacheAsExpiredButDontRemove(address);
        } catch (e) {
            improveAndRethrow(e, "markEtherBalanceCacheAsExpired");
        }
    }

    static actualizeBalanceCacheWithAmountAtoms(amountAtoms, sign) {
        try {
            const address = EthAddressesService.getCurrentEthAddress();
            EthBalanceProvider.actualizeBalanceCacheWithAmountAtoms(address, amountAtoms, sign);
        } catch (e) {
            improveAndRethrow(e, "actualizeBalanceCacheWithAmountAtoms");
        }
    }
}
