import bip39 from "bip39";

import { getCurrentNetwork, getWalletId } from "../../../common/services/internal/storage";
import {
    getEcPairsToAddressesMapping,
    isAddressValid,
    isP2pkhAddress,
    isP2shAddress,
    isSegWitAddress,
} from "../lib/addresses";
import { getCurrentFeeRate } from "./feeRatesService";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { getAddresses } from "../lib/utxos";
import AddressesService from "./addressesService";
import UtxosService from "./internal/utxosService";
import AddressesDataApi from "../../common/backend-api/addressesDataApi";
import { EventBus, USER_READY_TO_SEND_TRANSACTION_EVENT } from "../../../common/adapters/eventbus";
import { buildTransaction } from "../lib/transactions/build-transaction";
import { createFakeSendAllTransaction, createFakeTransaction } from "../lib/transactions/fake-transactions";
import { broadcastTransaction } from "./internal/transactionsBroadcastingService";
import { Logger } from "../../../support/services/internal/logs/logger";
import { Coins } from "../../coins";

export default class PaymentService {
    static BLOCKS_COUNTS_FOR_OPTIONS = [1, 5, 10, 25]; // WARNING: changing order will cause wrong fee options calculation

    /**
     * Creates transaction and broadcasts it to the network. Saves its description if present on successful broadcasting.
     *
     * @param mnemonic {string} mnemonic words of this wallet
     * @param passphrase {string} passphrase string of this wallet
     * @param txData {TxData} data to create transaction
     * @return {Promise<string>} resolving to transaction id of transaction appeared in the blockchain
     */
    static async createTransactionAndBroadcast(mnemonic, passphrase, txData) {
        const loggerSource = "createTransactionAndBroadcast";
        try {
            Logger.log(`Start broadcasting ${txData.amount} satoshi to ${txData.address}`, loggerSource);
            const seedHex = bip39.mnemonicToSeedHex(mnemonic, passphrase);
            const indexes = await AddressesDataApi.getAddressesIndexes(getWalletId());
            const mapping = getEcPairsToAddressesMapping(getAddresses(txData.utxos), seedHex, txData.network, indexes);
            const transaction = buildTransaction(
                txData.amount,
                txData.address,
                txData.change,
                txData.changeAddress,
                txData.utxos,
                mapping,
                txData.network
            );

            const transactionId = await broadcastTransaction(transaction, txData.network);

            Logger.log(`Transaction was pushed ${transactionId}`, loggerSource);

            return transactionId;
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Tries to create transactions for 4 speed options with fake signatures
     * Composes TxData ready for sending for further usage.
     * Positions of items in the array of TxData is the same as in BLOCKS_COUNTS_FOR_OPTIONS (sorted by fee rate descending).
     *
     * @param address {string} target address
     * @param amountBtc {string} amount in coin denomination
     * @param isSendAll {boolean} whether transaction should send all available coins or not
     * @param network {Network} coin to create the fake tx for
     * @return {Promise<
     *         {
     *             result: true,
     *             txsDataArray:
     *                 TxData[]
     *                 |
     *                 {
     *                     errorDescription: string,
     *                     howToFix: string
     *                 }[]
     *         }
     *         |
     *         {
     *             result: false,
     *             errorDescription: string,
     *             howToFix: string
     *         }>}
     */
    static async createTransactionsWithFakeSignatures(address, amountBtc, isSendAll, network) {
        const loggerSource = "createTransactionsWithFakeSignatures";
        try {
            const resolvedPromises = await Promise.all([
                ...this.BLOCKS_COUNTS_FOR_OPTIONS.map(blocksCount => getCurrentFeeRate(network, blocksCount)),
                UtxosService.getAllSpendableUtxos(),
                !isSendAll ? AddressesService.getCurrentChangeAddress() : null,
            ]);
            const feeRates = resolvedPromises.slice(0, this.BLOCKS_COUNTS_FOR_OPTIONS.length);
            const [utxos, changeAddress] = resolvedPromises.slice(resolvedPromises.length - 2);

            Logger.log(`Got ${utxos.length} UTXOs`, loggerSource);

            let resultsArray = feeRates.map(feeRate => {
                let txData;
                if (isSendAll) {
                    txData = createFakeSendAllTransaction(address, feeRate, utxos, network);
                } else {
                    const satoshies = Number(Coins.COINS.BTC.coinAmountToAtoms(amountBtc));
                    txData = createFakeTransaction(satoshies, address, changeAddress, feeRate, utxos, network);
                }

                if (!txData?.errorDescription) {
                    return txData;
                } else {
                    Logger.log(
                        `Creation failed. Rate: ${feeRate.blocksCount}->${feeRate.rate}. ${txData.errorDescription}. ${txData.howToFix}`,
                        loggerSource
                    );
                    return { errorDescription: txData.errorDescription, howToFix: txData.howToFix };
                }
            });

            return {
                result: true,
                txsDataArray: resultsArray,
            };
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        }
    }

    /**
     * Validates address whether we can send coins to it.
     * Address should be not empty, valid P2PKH, P2SH or bech32 address string.
     *
     * @param address {string} address to be validated
     * @return {
     *             {
     *                 result: false,
     *                 errorDescription: String,
     *                 howToFix: String,
     *             }
     *             |
     *             {
     *                 result: true,
     *                 address: String
     *             }
     *         }
     */
    static isAddressValidForSending(address) {
        try {
            return validateTargetAddress(address, getCurrentNetwork());
        } catch (e) {
            improveAndRethrow(e, "isAddressValidForSending");
        }
    }

    /**
     * Sends event that user is ready to send transaction. This is needed for logging the state of wallet before the sending
     */
    static notifyThatTheUserIsReadyTOSendTransaction() {
        EventBus.dispatch(USER_READY_TO_SEND_TRANSACTION_EVENT);
    }
}

// TODO: [tests, moderate] Extract from tests of methods using this one. task_id=c744fff79f8f4904b803730bf24548e8
function validateTargetAddress(address, currentNetwork) {
    if (!address) {
        return {
            result: false,
            errorDescription: "An address is required. ",
            howToFix: "Please enter your address. ",
        };
    }

    // TODO: [feature, high] add taproot support task_id=436e6743418647dd8bf656cd5e887742
    if (isAddressValid(address, currentNetwork)) {
        if (isP2pkhAddress(address) || isP2shAddress(address) || isSegWitAddress(address)) {
            return {
                result: true,
                address: address,
            };
        } else {
            return {
                result: false,
                errorDescription: "The address has an unsupported format. ",
                howToFix: "Enter your Bitcoin address using one of the following formats: P2PKH, P2SH, or bech32. ",
            };
        }
    }

    return {
        result: false,
        errorDescription: "The entered address is not valid. ",
        howToFix: "Please check the address and try again. ",
    };
}
