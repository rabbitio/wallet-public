import { ethers } from "ethers";
import { Coin } from "../../common/models/coin";
import { Network } from "../../common/models/networks";
import { bip44Scheme } from "../../btc/lib/addresses-schemes";
import { getCurrentNetwork } from "../../../common/services/internal/storage";
import { ethereum } from "../../eth/ethereum";
import { NumbersUtils } from "../../common/utils/numbersUtils";
import { AmountUtils } from "../../common/utils/amountUtils";
import { ERC20 } from "../erc20Protocol";
import { ETHEREUM_BLOCKCHAIN } from "../../eth/ethereumBlockchain";

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
        if (getCurrentNetwork(this)?.key === this.mainnet.key) {
            return `https://blockchair.com/ethereum/transaction/${txId}?from=rabbitio`;
        }
        return `https://${this.testnet.key}etherscan.io/tx/${txId}`;
    }

    coinAtomsFeeRateToCommonlyUsedAmountFormatWithDenominationString(coinAtomsString) {
        return (+ethers.utils.formatUnits("" + coinAtomsString, "gwei")).toFixed(1) + " gw/gas";
    }
}
