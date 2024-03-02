import { ethers } from "ethers";

import { AmountUtils } from "@rabbitio/ui-kit";

import { Coin } from "../../common/models/coin.js";
import { Network } from "../../common/models/networks.js";
import { bip44Scheme } from "../../btc/lib/addresses-schemes.js";
import { Storage } from "../../../common/services/internal/storage.js";
import { tron } from "../../trx/tron.js";
import { TRC20 } from "../trc20Protocol.js";
import { TRON_BLOCKCHAIN } from "../../trx/tronBlockchain.js";

export class Trc20Token extends Coin {
    /**
     * WARNING: we use singleton coins objects all over the app. Don't create custom instances.
     */
    constructor(latinName, tickerPrintable, digitsCountAfterComma, contractAddress, atomName = "", maxValue = null) {
        super(
            latinName,
            `${tickerPrintable}${TRC20.protocol}`,
            tickerPrintable,
            digitsCountAfterComma,
            maxValue,
            atomName,
            new Network("mainnet", 195, 0, 1, 20, [bip44Scheme]),
            new Network("nile", 195, 0, 1, 20, [bip44Scheme]),
            1,
            null,
            null,
            60000,
            TRON_BLOCKCHAIN,
            TRC20,
            contractAddress,
            false
        );
        this.feeCoin = tron;
    }

    atomsToCoinAmount(atoms) {
        return AmountUtils.removeRedundantRightZerosFromNumberString(ethers.utils.formatUnits("" + atoms, this.digits));
    }

    coinAmountToAtoms(coinsAmount) {
        coinsAmount = AmountUtils.trim(coinsAmount, this.digits);
        return ethers.utils.parseUnits(coinsAmount, this.digits).toString();
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
