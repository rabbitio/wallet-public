import { ethers } from "ethers";
import { BigNumber } from "bignumber.js";

import { AmountUtils } from "@rabbitio/ui-kit";

import { Coin } from "../../common/models/coin.js";
import { Network } from "../../common/models/networks.js";
import { bip44Scheme } from "../../btc/lib/addresses-schemes.js";
import { Storage } from "../../../common/services/internal/storage.js";
import { ethereum } from "../../eth/ethereum.js";
import { ERC20 } from "../erc20Protocol.js";
import { ETHEREUM_BLOCKCHAIN } from "../../eth/ethereumBlockchain.js";

export class Erc20Token extends Coin {
    /**
     * WARNING: we use singleton coins objects all over the app. Don't create custom instances.
     */
    constructor(latinName, tickerPrintable, digitsCountAfterComma, contractAddress, atomName = "", maxValue = null) {
        super(
            latinName,
            `${tickerPrintable}${ERC20.protocol}`,
            tickerPrintable,
            digitsCountAfterComma,
            maxValue,
            atomName,
            new Network("mainnet", 60, 0, 1, 24, [bip44Scheme]),
            new Network("goerli", 60, 0, 1, 24, [bip44Scheme]),
            1,
            "gas",
            ["30min", "5min", "3.5min", "2min"],
            60000,
            ETHEREUM_BLOCKCHAIN,
            ERC20,
            contractAddress
        );
        this.feeCoin = ethereum;
    }

    atomsToCoinAmount(atoms) {
        return AmountUtils.removeRedundantRightZerosFromNumberString(ethers.utils.formatUnits("" + atoms, this.digits));
    }

    coinAmountToAtoms(coinsAmount) {
        coinsAmount = AmountUtils.trim(coinsAmount, this.digits);
        return ethers.utils.parseUnits(coinsAmount, this.digits).toString();
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
