import { BigNumber, ethers } from "ethers";
import { ETH_PR_K } from "../../../../properties";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { Logger } from "../../../support/services/internal/logs/logger";
import { TxData } from "../../common/models/tx-data";
import { getCurrentNetwork } from "../../../common/services/internal/storage";
import { Coins } from "../../coins";
import { EthKeys } from "../lib/ethKeys";
import { ethFeeRatesProvider } from "../external-apis/ethFeeRatesProvider";
import { EthBalanceService } from "./ethBalanceService";
import { Erc20transactionUtils } from "../../erc20token/lib/erc20transactionUtils";

export class EthSendTransactionService {
    static GAS_LIMIT_FOR_ETHER_TRANSFER = BigNumber.from("21000");

    /**
     * Validates address and amount and tries to create transactions for 4 speed options with fake signatures
     * Composes TxData ready for sending for further usage if all is ok.
     *
     * @param coin {Coin} coin to create fake txs options for
     * @param address {string} address to be validated
     * @param coinAmount {string} amount to be validated in coin denomination
     * @param isSendAll {boolean} whether transaction should send all available coins or not
     * @param network {Network} coin to create the fake transaction for
     * @param balanceCoins {number|string} balance of coin we are creating transactions for
     * @param gasLimit {BigNumber} amount of gas units these transactions are aiming to spend
     * @return {Promise<
     *         {
     *             result: true,
     *             txsDataArray:
     *                 TxData[]
     *                 |
     *                 {
     *                     errorDescription: string,
     *                     howToFix: string
     *                 }[],
     *             isFeeCoinBalanceZero: boolean,
     *             isFeeCoinBalanceNotEnoughForAllOptions: boolean,
     *         }
     *         |
     *         {
     *             result: false,
     *             errorDescription: string,
     *             howToFix: string
     *         }>}
     *         Each correctly calculated TxData contain "rate" filed filled with the object
     *         { rate: string, maxPriorityFeePerGasWei: BigNumber } (rate in wei)
     */
    static async createEthereumBlockchainCoinTransactionsWithFakeSignatures(
        coin,
        address,
        coinAmount,
        isSendAll,
        network,
        balanceCoins,
        gasLimit = this.GAS_LIMIT_FOR_ETHER_TRANSFER
    ) {
        try {
            const atomsAmount = coin.coinAmountToAtoms(coinAmount);
            const sendBalanceAtoms = coin.coinAmountToAtoms("" + balanceCoins);
            let feeBalance = coin.doesUseDifferentCoinFee() ? await EthBalanceService.getEthWalletBalance() : null;
            const feeBalanceAtoms = feeBalance == null ? sendBalanceAtoms : coin.feeCoin.coinAmountToAtoms(feeBalance);
            const { baseFeePerGas, optionsForMaxPriorityFeePerGas } = await ethFeeRatesProvider.retrieveEthFeeRates();

            let result;
            let isAtLeastOneOptionCoverable;
            if (!baseFeePerGas || optionsForMaxPriorityFeePerGas.find(option => typeof option !== "number")) {
                const data = await optsForOneRate(
                    network,
                    gasLimit,
                    atomsAmount,
                    isSendAll,
                    sendBalanceAtoms,
                    feeBalanceAtoms,
                    address,
                    coin
                );
                result = data.result;
                isAtLeastOneOptionCoverable = data.isAtLeastOneOptionCoverable;
            } else {
                const data = optsForSeveralRates(
                    optionsForMaxPriorityFeePerGas,
                    baseFeePerGas,
                    gasLimit,
                    atomsAmount,
                    isSendAll,
                    sendBalanceAtoms,
                    feeBalanceAtoms,
                    coin,
                    address,
                    network
                );
                isAtLeastOneOptionCoverable = data.isAtLeastOneOptionCoverable;
                result = data.result;
            }
            result.isFeeCoinBalanceZero = feeBalanceAtoms === "0";
            result.isFeeCoinBalanceNotEnoughForAllOptions = !isAtLeastOneOptionCoverable;

            return result;
        } catch (e) {
            improveAndRethrow(e, "createEthereumBlockchainCoinTransactionsWithFakeSignatures");
        }
    }

    /**
     * Creates transaction and broadcasts it to the network. Saves its description if present on successful broadcasting.
     * Supports sending for ETH and ERC20 tokens
     *
     * @param coin {Coin} coin to send transaction in
     * @param mnemonic {string} mnemonic words of this wallet
     * @param passphrase {string} passphrase string of this wallet
     * @param txData {TxData} data to create transaction
     * @return {Promise<string|{ errorDescription: string, howToFix: string }>} resolving to transaction id of transaction
     *         appeared in the blockchain or to a determined error object
     */
    static async createEthTransactionAndBroadcast(coin, mnemonic, passphrase, txData) {
        try {
            const network = getCurrentNetwork(coin);
            const provider = new ethers.providers.AlchemyProvider(network.key, ETH_PR_K);
            const { privateKey } = EthKeys.generateKeysForAccountAddressByWalletCredentials(
                mnemonic,
                passphrase,
                network
            );

            const wallet = new ethers.Wallet(privateKey).connect(provider);
            const tx = {
                from: wallet.address,
                to: coin === Coins.COINS.ETH ? txData.address : coin.tokenAddress,
                value: coin === Coins.COINS.ETH ? ethers.BigNumber.from(txData.amount) : BigNumber.from("0"),
                maxFeePerGas: BigNumber.from(txData.feeRate.rate),
                maxPriorityFeePerGas: txData.feeRate.maxPriorityFeePerGasWei,
                gasLimit: txData.feeRate.gasLimit,
                nonce: await wallet.getTransactionCount("latest"),
            };
            if (coin !== Coins.COINS.ETH) {
                tx.data = Erc20transactionUtils.composeEthereumTransactionDataForGivenParams(
                    txData.address,
                    txData.amount
                );
            }

            Logger.log(`Sending ethereum tx: ${JSON.stringify(tx)}`);

            let sentTx;
            try {
                sentTx = await wallet.sendTransaction(tx);
            } catch (e) {
                Logger.log("Failed to send ethereum tx. Trying to extract determined error from " + JSON.stringify(e));
                const determinedError = tryToGetDeterminedErrorFromEtherSendError(e);
                if (determinedError) return determinedError;

                throw e;
            }

            if (!sentTx.hash) {
                throw new Error("Sent ethereum tx has null hash: " + JSON.stringify(sentTx));
            }

            Logger.log("Successfully sent a ethereum transaction: " + JSON.stringify(sentTx.hash));
            return sentTx.hash;
        } catch (e) {
            Logger.log("Failed to send ethereum transaction: " + JSON.stringify(e));
            improveAndRethrow(e, "createEthTransactionAndBroadcast");
        }
    }
}

const chooseAmount = function(
    coin,
    amountAtoms,
    isSendAll,
    feeAtoms,
    balanceOfSendingCoinAtoms,
    balanceOfFeeCoinAtoms
) {
    const balanceAtomsBigN = ethers.BigNumber.from(balanceOfFeeCoinAtoms);
    if (!isSendAll) {
        return amountAtoms;
    }
    return coin.doesUseDifferentCoinFee()
        ? balanceOfSendingCoinAtoms
        : balanceAtomsBigN.gte(feeAtoms)
        ? balanceAtomsBigN.sub(feeAtoms).toString()
        : "0";
};

async function optsForOneRate(
    network,
    gasLimit,
    atomsAmount,
    isSendAll,
    sendBalanceAtoms,
    feeBalanceAtoms,
    address,
    coin
) {
    // Fallback logic to return 4 identical fee options calculated by single option Alchemy data if major rates retrieval fails
    const provider = new ethers.providers.AlchemyProvider(network.key, ETH_PR_K);
    const { maxFeePerGas, maxPriorityFeePerGas } = await provider.getFeeData();
    const feeAtoms = maxFeePerGas.mul(gasLimit).toString();
    const correctAtomsAmount = chooseAmount(coin, atomsAmount, isSendAll, feeAtoms, sendBalanceAtoms, feeBalanceAtoms);
    const rateAtoms = maxFeePerGas.toString();

    return {
        result: {
            result: true,
            txsDataArray: new Array(4).fill(
                new TxData(correctAtomsAmount, address, null, feeAtoms, null, null, network, {
                    rate: rateAtoms,
                    maxPriorityFeePerGasWei: maxPriorityFeePerGas.toString(),
                    gasLimit: gasLimit,
                })
            ),
        },
        isAtLeastOneOptionCoverable: ethers.BigNumber.from(feeAtoms)
            .add(coin.doesUseDifferentCoinFee() ? "0" : correctAtomsAmount)
            .lte(feeBalanceAtoms),
    };
}

function optsForSeveralRates(
    ratesGWei,
    baseFeePerGas,
    gasLimit,
    atomsAmount,
    isSendAll,
    sendBalanceAtoms,
    feeBalanceAtoms,
    coin,
    address,
    network
) {
    const feeData = ratesGWei.map(maxPriorityFeePerGasOption => {
        const fee = ethers.utils
            .parseUnits(`${(+baseFeePerGas + +maxPriorityFeePerGasOption).toFixed(9)}`, "gwei")
            .mul(gasLimit)
            .toString();
        return {
            maxPriorityFeePerGasOption: maxPriorityFeePerGasOption,
            feeWeiString: fee,
            correctedAtomsAmount: chooseAmount(coin, atomsAmount, isSendAll, fee, sendBalanceAtoms, feeBalanceAtoms),
        };
    });
    const feeIsCoverableFlags = feeData.map(d => {
        return ethers.BigNumber.from(d.feeWeiString)
            .add(coin.doesUseDifferentCoinFee() ? "0" : d.correctedAtomsAmount)
            .lte(feeBalanceAtoms);
    });
    const isAtLeastOneOptionCoverable = !!feeIsCoverableFlags.find(flag => flag);
    const result = {
        result: true,
        txsDataArray: feeData.map((d, index) => {
            if (isAtLeastOneOptionCoverable && !feeIsCoverableFlags[index]) {
                /**
                 * We return error object if at least one of remaining options is coverable. If all
                 * options cannot be covered we return them so the user can see fee estimation
                 */
                return {
                    errorDescription: "There is not enough ETH to send the amount with selected fee",
                    howToFix: "Either use smaller fee option or top up your ETH balance",
                };
            }

            /**
             * ETH fee rate is a sum of ongoing block's baseFeePerGas and current maxPriorityFeePerGas.
             * These values are circulating in gWei, so we multiply the sum with 100 to take into account
             * the digits after dot. Then we parse this multiplied sum using "7" as units number
             * (gWei is 10^-9, so 10^-9 * 100 = 10^-7).
             */
            const rateAtoms = ethers.utils.parseUnits(
                "" + Math.round(((+baseFeePerGas ?? 0) + (+d.maxPriorityFeePerGasOption ?? 0)) * 100),
                7
            );
            return new TxData(d.correctedAtomsAmount, address, null, d.feeWeiString, null, null, network, {
                rate: rateAtoms,
                maxPriorityFeePerGasWei: ethers.utils.parseUnits("" + d.maxPriorityFeePerGasOption, "gwei"),
                gasLimit: gasLimit,
            });
        }),
    };

    return { isAtLeastOneOptionCoverable: isAtLeastOneOptionCoverable, result: result };
}

export function tryToGetDeterminedErrorFromEtherSendError(e) {
    /**
     * We try to determine common errors here.
     * TODO: [feature, critical] Experiment and add other errors handling like nonce errors
     */
    if (/cannot estimate gas/.test(e.message)) {
        /**
         * This error has 32000 code - this code is for server-specific errors for ETH JSON RPC, not standard ones.
         * This is caused by eth_estimateGas internal call. During the development we noticed that this error
         * occurs when trying to estimate tx having not enough balance to send the transaction and cover the fee.
         * So we return the determined that the options should be recalculated.
         */
        return {
            errorDescription:
                "Looks like fee rate changes really fast and selected option no more relevant to send the transaction as it plus sending amount overlap the balance",
            howToFix: "Please go back to the send form and choose from the newly calculated options",
        };
    }

    return null;
}
