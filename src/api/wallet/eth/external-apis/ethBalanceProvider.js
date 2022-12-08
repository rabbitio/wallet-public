import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { ethers } from "ethers";
import { getCurrentNetwork } from "../../../common/services/internal/storage";
import { Coins } from "../../coins";
import { ETH_PR_K } from "../../../../properties";

export class EthBalanceProvider {
    static _provider = new ethers.providers.AlchemyProvider(getCurrentNetwork(Coins.COINS.ETH).key, ETH_PR_K);

    /**
     * Retrieves ether balance for address
     *
     * @param address {string} address to get balance for
     * @returns {Promise<BigNumber>}
     */
    static async getEthBalanceForAddress(address) {
        try {
            return await this._provider.getBalance(address);
        } catch (e) {
            improveAndRethrow(e, "getEthBalanceForAddress");
        }
    }
}
