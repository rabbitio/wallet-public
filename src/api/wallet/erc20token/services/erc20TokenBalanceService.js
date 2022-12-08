import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { EthAddressesService } from "../../eth/services/ethAddressesService";
import { Erc20Providers } from "../external-apis/erc20TokenProvider";
import { Logger } from "../../../support/services/internal/logs/logger";

export class Erc20TokenBalanceService {
    /**
     * Retrieves token's balance
     *
     * @param coin {Coin} token to get balance for
     * @returns {Promise<string>} balance string in token's atoms
     */
    static async calculateBalance(coin) {
        try {
            const address = EthAddressesService.getCurrentEthAddress();
            const provider = Erc20Providers.getProviderByCoin(coin);
            const balance = await provider.getBalanceByAccountAddress(address);
            const balanceCoins = coin.atomsToCoinAmount(balance);
            Logger.log(`Balance for ${coin.ticker} ${balanceCoins}`);

            return balanceCoins;
        } catch (e) {
            improveAndRethrow(e, "calculateBalance");
        }
    }
}
