import { ethers } from "ethers";
import { getCurrentNetwork } from "../../common/services/internal/storage";
import { NumbersUtils } from "../common/utils/numbersUtils";
import { bip44Scheme } from "../btc/lib/addresses-schemes";
import { Coin } from "../common/models/coin";
import { Network } from "../common/models/networks";

class Ethereum extends Coin {
    constructor() {
        super(
            "Ethereum",
            "ETH",
            "ETH",
            18,
            null,
            "wei",
            new Network("mainnet", 60, 0, 1, 24, [bip44Scheme]),
            new Network("goerli", 60, 0, 1, 24, [bip44Scheme]),
            16,
            "gas",
            ["30min", "5min", "3.5min", "2min"],
            60000
        );
    }

    atomsToCoinAmount(atoms) {
        return NumbersUtils.removeRedundantRightZerosFromNumberString(ethers.utils.formatEther(atoms));
    }

    atomsToCoinAmountSignificantString(atoms) {
        const parts = ethers.utils.formatEther(atoms).split(".");
        return NumbersUtils.removeRedundantRightZerosFromNumberString(
            `${parts[0]}.${parts[1].slice(0, Math.min(this.digits, this._significantDigits))}`
        );
    }

    coinAmountToAtoms(coinsAmount) {
        return ethers.utils.parseEther("" + coinsAmount).toString();
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

export const ethereum = new Ethereum();
