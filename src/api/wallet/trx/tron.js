import { Coin } from "../common/models/coin";
import { Network } from "../common/models/networks";
import { bip44Scheme } from "../btc/lib/addresses-schemes";
import { NumbersUtils } from "../common/utils/numbersUtils";
import { getCurrentNetwork } from "../../common/services/internal/storage";

class Tron extends Coin {
    constructor() {
        super(
            "Tron",
            "TRX",
            "TRX",
            6,
            null,
            "sun",
            new Network("mainnet", 195, 0, 1, 20, [bip44Scheme]),
            new Network("nile", 195, 0, 1, 20, [bip44Scheme]),
            20,
            "energy",
            null, // Doesn't provide an option to prioritise the transactions
            60000,
            Coin.BLOCKCHAINS.TRON,
            null,
            null,
            false
        );
    }

    atomsToCoinAmount(atoms) {
        return NumbersUtils.removeRedundantRightZerosFromNumberString((+atoms / 1000000).toFixed(this.digits));
    }

    atomsToCoinAmountSignificantString(atoms, maxNumberLength = null) {
        return NumbersUtils.trimCurrencyAmount(+atoms / 1000000, this.digits, maxNumberLength);
    }

    coinAmountToAtoms(coinsAmount) {
        return NumbersUtils.removeRedundantRightZerosFromNumberString(Math.floor(+coinsAmount * 1000000));
    }

    composeUrlToTransactionExplorer(txId) {
        return `https://tronscan.org/#/transaction/${
            getCurrentNetwork(this)?.key === this.mainnet.key ? "" : `${this.testnet.key}/`
        }${txId}`;
    }

    coinAtomsFeeRateToCommonlyUsedAmountFormatWithDenominationString(coinAtomsString) {
        return ""; // Not supported
    }
}

export const tron = new Tron();
