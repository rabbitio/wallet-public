import { BigNumber } from "bignumber.js";

import { AmountUtils } from "@rabbitio/ui-kit";

import { Coin } from "../common/models/coin.js";
import { Network } from "../common/models/networks.js";
import { SupportedSchemes } from "./lib/addresses-schemes.js";
import { Storage } from "../../common/services/internal/storage.js";
import { BITCOIN_BLOCKCHAIN } from "./bitcoinBlockchain.js";

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
            1,
            "byte",
            ["3.5 h", "1.5 h", "50 min", "10 min"],
            300000,
            BITCOIN_BLOCKCHAIN,
            null,
            null,
            false,
            true
        );
    }

    atomsToCoinAmount(atoms) {
        return AmountUtils.removeRedundantRightZerosFromNumberString(
            BigNumber(atoms).div(100_000_000).toFixed(this.digits, BigNumber.ROUND_FLOOR)
        );
    }

    coinAmountToAtoms(coinsAmount) {
        const satoshi = BigNumber(coinsAmount).times(100_000_000).toFixed(0, BigNumber.ROUND_FLOOR);
        return AmountUtils.removeRedundantRightZerosFromNumberString(satoshi);
    }

    composeUrlToTransactionExplorer(txId) {
        return `https://blockchair.com/bitcoin/${
            Storage.getCurrentNetwork(this)?.key === this.mainnet.key ? "" : `${this.testnet.key}/`
        }transaction/${txId}?from=rabbitio`;
    }

    coinAtomsFeeRateToCommonlyUsedAmountFormatWithDenominationString(coinAtomsString) {
        return coinAtomsString + " sat/B";
    }
}

/**
 * WARNING: we use singleton coins objects all over the app. Don't create custom instances.
 */
export const bitcoin = new Bitcoin();
