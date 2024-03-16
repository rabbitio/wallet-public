import { ethers } from "ethers";
import { BigNumber } from "bignumber.js";

import { AmountUtils, Coin } from "@rabbitio/ui-kit";

import { Storage } from "../../common/services/internal/storage.js";
import { bip44Scheme } from "../btc/lib/addresses-schemes.js";
import { Network } from "../common/models/networks.js";
import { ETHEREUM_BLOCKCHAIN } from "./ethereumBlockchain.js";

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
        return AmountUtils.removeRedundantRightZerosFromNumberString(ethers.utils.formatEther(atoms));
    }

    coinAmountToAtoms(coinsAmount) {
        coinsAmount = AmountUtils.trim(coinsAmount, this.digits);
        return ethers.utils.parseEther(coinsAmount).toString();
    }

    composeUrlToTransactionExplorer(txId) {
        if (Storage.getCurrentNetwork(this)?.key === this.mainnet.key) {
            return `https://blockchair.com/ethereum/transaction/${txId}?from=rabbitio`;
        }
        return `https://${this.testnet.key}etherscan.io/tx/${txId}`;
    }

    coinAtomsFeeRateToCommonlyUsedAmountFormatWithDenominationString(coinAtomsString) {
        return BigNumber(ethers.utils.formatUnits("" + coinAtomsString, "gwei")).toFixed(1) + " gw/gas";
    }
}

/**
 * WARNING: we use singleton coins objects all over the app. Don't create custom instances.
 */
export const ethereum = new Ethereum();
