import { ethers } from "ethers";
import { Coin } from "../../common/models/coin";
import { Network } from "../../common/models/networks";
import { bip44Scheme } from "../../btc/lib/addresses-schemes";
import { getCurrentNetwork } from "../../../common/services/internal/storage";
import { tron } from "../../trx/tron";
import { NumbersUtils } from "../../common/utils/numbersUtils";

export class Trc20Token extends Coin {
    constructor(latinName, tickerPrintable, digitsCountAfterComma, contractAddress, atomName = "", maxValue = null) {
        super(
            latinName,
            `${tickerPrintable}${Coin.PROTOCOLS.TRC20.protocol}`,
            tickerPrintable,
            digitsCountAfterComma,
            maxValue,
            atomName,
            new Network("mainnet", 195, 0, 1, 20, [bip44Scheme]),
            new Network("nile", 195, 0, 1, 20, [bip44Scheme]),
            20,
            null,
            null,
            60000,
            Coin.BLOCKCHAINS.TRON,
            Coin.PROTOCOLS.TRC20,
            contractAddress,
            false
        );
        this.feeCoin = tron;
    }

    atomsToCoinAmount(atoms) {
        return ethers.utils.formatUnits("" + atoms, this.digits);
    }

    atomsToCoinAmountSignificantString(atoms, maxNumberLength = null) {
        const coinAmountString = ethers.utils.formatUnits("" + atoms, this.digits);
        return NumbersUtils.trimCurrencyAmount(coinAmountString, this.digits, maxNumberLength);
    }

    coinAmountToAtoms(coinsAmount) {
        return ethers.utils.parseUnits("" + coinsAmount, this.digits).toString();
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
