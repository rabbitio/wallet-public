import { BigNumber } from "bignumber.js";

import { AmountUtils, Coin } from "@rabbitio/ui-kit";

import { Network } from "../common/models/networks.js";
import { bip44Scheme } from "../btc/lib/addresses-schemes.js";
import { Storage } from "../../common/services/internal/storage.js";
import { TRON_BLOCKCHAIN } from "./tronBlockchain.js";

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
            1,
            "energy",
            null, // Doesn't provide an option to prioritise the transactions
            60000,
            TRON_BLOCKCHAIN,
            null,
            null,
            false
        );
    }

    atomsToCoinAmount(atoms) {
        return AmountUtils.removeRedundantRightZerosFromNumberString(
            AmountUtils.trim(BigNumber(atoms).div(1_000_000), this.digits)
        );
    }

    coinAmountToAtoms(coinsAmount) {
        const atoms = AmountUtils.trim(BigNumber(coinsAmount).times(1_000_000), this.digits);
        return AmountUtils.removeRedundantRightZerosFromNumberString(atoms);
    }

    composeUrlToTransactionExplorer(txId) {
        return `https://tronscan.org/#/transaction/${
            Storage.getCurrentNetwork(this)?.key === this.mainnet.key ? "" : `${this.testnet.key}/`
        }${txId}`;
    }

    coinAtomsFeeRateToCommonlyUsedAmountFormatWithDenominationString(coinAtomsString) {
        return ""; // Not supported
    }
}

/**
 * WARNING: we use singleton coins objects all over the app. Don't create custom instances.
 */
export const tron = new Tron();
