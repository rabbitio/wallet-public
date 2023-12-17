import { ethers } from "ethers";
import { getCurrentNetwork } from "../../common/services/internal/storage";
import { NumbersUtils } from "../common/utils/numbersUtils";
import { bip44Scheme } from "../btc/lib/addresses-schemes";
import { Coin } from "../common/models/coin";
import { Network } from "../common/models/networks";
import { AmountUtils } from "../common/utils/amountUtils";
import { ETHEREUM_BLOCKCHAIN } from "./ethereumBlockchain";

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
            1,
            "gas",
            ["30min", "5min", "3.5min", "2min"],
            60000,
            ETHEREUM_BLOCKCHAIN
        );
    }

    atomsToCoinAmount(atoms) {
        return NumbersUtils.removeRedundantRightZerosFromNumberString(ethers.utils.formatEther(atoms));
    }

    atomsToCoinAmountSignificantString(atoms, maxNumberLength = null) {
        const coinAmountString = ethers.utils.formatEther(atoms);
        return NumbersUtils.trimCurrencyAmount(coinAmountString, this.digits, maxNumberLength);
    }

    coinAmountToAtoms(coinsAmount) {
        coinsAmount = AmountUtils.trimDigitsAfterPeriod(coinsAmount, this.digits, false);
        return ethers.utils.parseEther(coinsAmount).toString();
    }

    composeUrlToTransactionExplorer(txId) {
        if (getCurrentNetwork(this)?.key === this.mainnet.key) {
            return `https://blockchair.com/ethereum/transaction/${txId}?from=rabbitio`;
        }
        return `https://${this.testnet.key}etherscan.io/tx/${txId}`;
    }

    coinAtomsFeeRateToCommonlyUsedAmountFormatWithDenominationString(coinAtomsString) {
        return (+ethers.utils.formatUnits("" + coinAtomsString, "gwei")).toFixed(1) + " gw/gas";
    }
}

/**
 * WARNING: we use singleton coins objects all over the app. Don't create custom instances.
 */
export const ethereum = new Ethereum();
