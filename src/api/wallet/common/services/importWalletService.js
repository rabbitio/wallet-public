import { logError } from "../../../common/utils/errorUtils";
import { Erc20TokenBalanceService } from "../../erc20token/services/erc20TokenBalanceService";
import { TronBlockchainBalancesService } from "../../trx/services/tronBlockchainBalancesService";
import { Coins } from "../../coins";
import { ImportBtcWalletService } from "../../btc/services/importBtcWalletService";

export class ImportWalletService {
    static async safelyRecogniseTokensAndScanBtcWhenImporting() {
        try {
            await ImportBtcWalletService.grabBtcWalletHistoricalDataAndSave();
            const coinsToEnable = Coins.getDefaultEnabledCoinsList();
            const erc20TokensToEnable = await Erc20TokenBalanceService.getSupportedErc20TokensHavingNonZeroBalance();
            // We don't get eth balance here separately as we usually have ether enabled for all new wallets
            const trxOrTrc20TokensToEnable = await TronBlockchainBalancesService.getTronOrTrc20TokensHavingNotZeroBalance();
            [...erc20TokensToEnable, ...trxOrTrc20TokensToEnable].forEach(token => {
                if (!coinsToEnable.find(coin => coin === token)) {
                    coinsToEnable.push(token);
                }
            });
            await Coins.setCurrentEnabledCoins(coinsToEnable);
        } catch (e) {
            logError(e, "safelyRecogniseTokensAndScanBtcWhenImporting");
        }
    }
}