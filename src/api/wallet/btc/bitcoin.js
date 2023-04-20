import { Coin } from "../common/models/coin";
import { Network } from "../common/models/networks";
import { SupportedSchemes } from "./lib/addresses-schemes";
import { NumbersUtils } from "../common/utils/numbersUtils";
import { getCurrentNetwork } from "../../common/services/internal/storage";

class Bitcoin extends Coin {
    constructor() {
        super(
            "Bitcoin",
            "BTC",
            "BTC",
            8,
            21000000,
            "satoshi",
            new Network("mainnet", 0, 0, 20, 3, SupportedSchemes),
            new Network("testnet", 1, 0, 20, 3, SupportedSchemes),
            3,
            "byte",
            ["3.5 h", "1.5 h", "50 min", "10 min"],
            300000,
            Coin.BLOCKCHAINS.BITCOIN
        );
    }

    atomsToCoinAmount(atoms) {
        return NumbersUtils.removeRedundantRightZerosFromNumberString((+atoms / 100000000).toFixed(this.digits));
    }

    atomsToCoinAmountSignificantString(atoms, maxNumberLength = null) {
        return NumbersUtils.trimCurrencyAmount(+atoms / 100000000, this.digits, maxNumberLength);
    }

    coinAmountToAtoms(coinsAmount) {
        return NumbersUtils.removeRedundantRightZerosFromNumberString(Math.floor(+coinsAmount * 100000000));
    }

    composeUrlToTransactionExplorer(txId) {
        return `https://blockstream.info/${
            getCurrentNetwork(this)?.key === this.mainnet.key ? "" : `${this.testnet.key}/`
        }tx/${txId}`;
    }

    coinAtomsFeeRateToCommonlyUsedAmountFormatWithDenominationString(coinAtomsString) {
        return coinAtomsString + " sat/B";
    }
}

export const bitcoin = new Bitcoin();
