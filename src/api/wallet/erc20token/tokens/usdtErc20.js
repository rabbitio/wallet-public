import { ethers } from "ethers";
import { Coin } from "../../common/models/coin";
import { Network } from "../../common/models/networks";
import { NumbersUtils } from "../../common/utils/numbersUtils";
import { bip44Scheme } from "../../btc/lib/addresses-schemes";
import { getCurrentNetwork } from "../../../common/services/internal/storage";

class UsdtErc20 extends Coin {
    constructor() {
        super(
            "Tether ERC20",
            "USDTERC20",
            "USDT",
            6,
            null,
            "milli-cent",
            new Network("mainnet", 60, 0, 1, 24, [bip44Scheme]),
            new Network("goerli", 60, 0, 1, 24, [bip44Scheme]),
            16,
            "gas",
            ["30min", "5min", "3.5min", "2min"],
            60000,
            "ERC20",
            "0xdac17f958d2ee523a2206206994597c13d831ec7"
        );
    }

    atomsToCoinAmount(atoms) {
        return NumbersUtils.removeRedundantRightZerosFromNumberString((+atoms / 1000000).toFixed(this.digits));
    }

    atomsToCoinAmountSignificantString(atoms) {
        return NumbersUtils.removeRedundantRightZerosFromNumberString(
            (+atoms / 1000000).toFixed(Math.min(this.digits, this._significantDigits))
        );
    }

    coinAmountToAtoms(coinsAmount) {
        return NumbersUtils.removeRedundantRightZerosFromNumberString("" + Math.floor(+coinsAmount * 1000000));
    }

    composeUrlToTransactionExplorer(txId) {
        return `https://${
            getCurrentNetwork(this)?.key === this.mainnet.key ? "" : `${this.testnet.key}.`
        }etherscan.io/tx/${txId}`;
    }

    coinAtomsFeeRateToCommonlyUsedAmountFormatWithDenominationString(coinAtomsString) {
        return (+ethers.utils.formatUnits("" + coinAtomsString, "gwei")).toFixed(1) + " gw/gas";
    }
}

export const usdtErc20 = new UsdtErc20();
