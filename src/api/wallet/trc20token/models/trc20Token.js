import { ethers } from "ethers";
import { Coin } from "../../common/models/coin";
import { Network } from "../../common/models/networks";
import { bip44Scheme } from "../../btc/lib/addresses-schemes";
import { getCurrentNetwork } from "../../../common/services/internal/storage";
import { tron } from "../../trx/tron";
import { NumbersUtils } from "../../common/utils/numbersUtils";
import { AmountUtils } from "../../common/utils/amountUtils";
import { TRC20 } from "../trc20Protocol";
import { TRON_BLOCKCHAIN } from "../../trx/tronBlockchain";

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
        return ethers.utils.formatUnits("" + atoms, this.digits);
    }

    atomsToCoinAmountSignificantString(atoms, maxNumberLength = null) {
        const coinAmountString = ethers.utils.formatUnits("" + atoms, this.digits);
        return NumbersUtils.trimCurrencyAmount(coinAmountString, this.digits, maxNumberLength);
    }

    coinAmountToAtoms(coinsAmount) {
        coinsAmount = AmountUtils.trimDigitsAfterPeriod(coinsAmount, this.digits, false);
        return ethers.utils.parseUnits(coinsAmount, this.digits).toString();
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
