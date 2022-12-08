import bitcoinJs from "bitcoinjs-lib";
import is from "is_js";

import { isAmountDustForAddress, P2PKH_SCRIPT_TYPE, P2SH_SCRIPT_TYPE, P2WPKH_SCRIPT_TYPE } from "../utxos";
import { EcPairsMappingEntry } from "../addresses";
import { Utxo } from "../../models/transaction/utxo";
import { Network } from "../../../common/models/networks";
import { improveAndRethrow } from "../../../../common/utils/errorUtils";
import { BitcoinJsAdapter } from "../../adapters/bitcoinJsAdapter";

export const MAX_RBF_SEQUENCE = 0xffffffff - 2; // 4294967293
export const FORBID_RBF_SEQUENCE = 0xffffffff; // 4294967295

/**
 * Builds transaction prohibiting dust output creation.
 * See docs for buildTransactionByCheckDustFlag.
 */
export function buildTransaction(
    amount,
    address,
    change,
    changeAddress,
    utxos,
    ecPairsMappingToAddresses,
    network,
    sequence
) {
    const allowDustAmountToBeSent = false;
    return buildTransactionByCheckDustFlag(
        amount,
        allowDustAmountToBeSent,
        address,
        change,
        changeAddress,
        utxos,
        ecPairsMappingToAddresses,
        network,
        sequence
    );
}

/**
 * Builds transaction possibly producing dust output.
 * See docs for buildTransactionByCheckDustFlag.
 */
export function buildTransactionUnsafe(
    amount,
    address,
    change,
    changeAddress,
    utxos,
    ecPairsMappingToAddresses,
    network,
    sequence
) {
    const allowDustAmountToBeSent = true;
    return buildTransactionByCheckDustFlag(
        amount,
        allowDustAmountToBeSent,
        address,
        change,
        changeAddress,
        utxos,
        ecPairsMappingToAddresses,
        network,
        sequence
    );
}

/**
 * Builds transaction on base of given parameters.
 * Only P2PKH, P2WPKH and P2SH-P2WPKH utxos are supported.
 * TODO: [docs, critical]
 * @param amount
 * @param allowDustAmountToBeSent
 * @param address
 * @param change
 * @param changeAddress
 * @param utxos
 * @param ecPairsMappingToAddresses
 * @param network
 * @param sequence
 * @returns {*}
 */
function buildTransactionByCheckDustFlag(
    amount,
    allowDustAmountToBeSent,
    address,
    change,
    changeAddress,
    utxos,
    ecPairsMappingToAddresses,
    network,
    sequence = MAX_RBF_SEQUENCE
) {
    try {
        if (is.not.string(address) || !address.length) {
            throw new Error("Address should be not empty string.");
        }

        const dustCheckResult = isAmountDustForAddress(amount, address);
        if (is.not.number(amount) || amount < 0 || (!allowDustAmountToBeSent && dustCheckResult.result)) {
            throw new Error(`Bad amount, should be number greater or equal to ${dustCheckResult.threshold}.`);
        }

        if (is.not.number(change) || change < 0) {
            throw new Error("Bad change amount, should be number greater or equal to 0.");
        }

        const changeDustCheckResult = isAmountDustForAddress(change, changeAddress);
        if (!changeDustCheckResult.result && (is.not.string(changeAddress) || !changeAddress.length)) {
            throw new Error("Change address should be not empty string.");
        }

        if (is.not.array(ecPairsMappingToAddresses) || !ecPairsMappingToAddresses.length) {
            throw new Error("Empty ecPairs to addresses mapping.");
        } else {
            ecPairsMappingToAddresses.forEach(mappingEntry => {
                if (!mappingEntry instanceof EcPairsMappingEntry) {
                    throw new Error("Mapping entries in array are of wrong type.");
                }
            });
        }

        if (is.not.array(utxos) || !utxos.length) {
            throw new Error("Empty utxos set.");
        } else {
            utxos.forEach(utxo => {
                if (!utxo instanceof Utxo) {
                    throw new Error("Utxos in array are of wrong type.");
                }

                const correspondingEntry = ecPairsMappingToAddresses.filter(
                    mappingEntry => mappingEntry.address === utxo.address
                );
                if (!correspondingEntry.length) {
                    throw new Error("Mapping is not corresponding to Utxos array.");
                }
            });
        }

        if (!network instanceof Network) {
            throw new Error("Network type is wrong.");
        }

        if (
            is.not.number(sequence) ||
            sequence < 0 ||
            (sequence !== FORBID_RBF_SEQUENCE && sequence > MAX_RBF_SEQUENCE)
        ) {
            throw new Error(`Invalid sequence number: ${sequence}`);
        }

        utxos = addEcPairsAndRequiredScriptsToUtxos(utxos, ecPairsMappingToAddresses);
        /**
         * Second parameter is MAX fee rate. The lib require it, but we should be here with the proper fee
         * so this feature is not critical for us and we just pass the amount to avoid warnings from lib
         */
        let transactionBuilder = new bitcoinJs.TransactionBuilder(
            BitcoinJsAdapter.toBitcoinJsNetwork(network.key),
            amount
        );
        for (let index = 0; index < utxos.length; ++index) {
            const utxo = utxos[index];
            if (utxo.type === P2WPKH_SCRIPT_TYPE) {
                // setting RBF sequence number to make the TX replaceable by default
                transactionBuilder.addInput(utxo.txid, utxo.number, sequence, utxo.prevOutScript);
            } else if (utxo.type === P2PKH_SCRIPT_TYPE || utxo.type === P2SH_SCRIPT_TYPE) {
                transactionBuilder.addInput(utxo.txid, utxo.number, sequence);
            }
        }

        transactionBuilder.addOutput(address, amount);
        if (!changeDustCheckResult.result) {
            transactionBuilder.addOutput(changeAddress, change);
        }

        // Signing after the addition of all inputs and outputs to avoid invalidation of transaction
        for (let index = 0; index < utxos.length; ++index) {
            const utxo = utxos[index];
            if (utxo.type === P2WPKH_SCRIPT_TYPE) {
                transactionBuilder.sign(index, utxo.ecPair, null, null, utxo.value_satoshis);
            } else if (utxo.type === P2PKH_SCRIPT_TYPE) {
                transactionBuilder.sign(index, utxo.ecPair);
            } else if (utxo.type === P2SH_SCRIPT_TYPE) {
                // By implementation we only can get P2SH-P2WPKH utxo here, so enough following:
                transactionBuilder.sign(index, utxo.ecPair, utxo.redeemScript, null, utxo.value_satoshis);
            }
        }

        return transactionBuilder.build();
    } catch (e) {
        improveAndRethrow(e, "buildTransaction");
    }
}

// // TODO: [refactoring, critical] Extract building a transaction to separate module or use Class to allow adequate testing without use of "exports"
// export const getBuildTransactionFunction = () => (IS_TESTING && exports.buildTransaction) || buildTransaction;
// export const getBuildTransactionUnsafeFunction = () =>
//     (IS_TESTING && exports.buildTransactionUnsafe) || buildTransactionUnsafe;

/**
 * Adds ecPairs and prevOutScript (of needed) to utxos.
 *
 * @param utxos - utxos to be updated with ecPair
 * @param ecPairsMappingToAddresses - mapping of ecPairs to addresses
 * @param network - network of utxos
 * @return Array of updated utxos
 */
function addEcPairsAndRequiredScriptsToUtxos(utxos, ecPairsMappingToAddresses, network) {
    utxos.forEach(utxo => {
        const { ecPair } = ecPairsMappingToAddresses.filter(mapping => mapping.address === utxo.address)[0];
        utxo.ecPair = ecPair;

        const p2wpkh = bitcoinJs.payments.p2wpkh({ pubkey: ecPair.publicKey, network: network });
        if (utxo.type === P2WPKH_SCRIPT_TYPE) {
            utxo.prevOutScript = p2wpkh.output;
        }

        if (utxo.type === P2SH_SCRIPT_TYPE) {
            const p2sh = bitcoinJs.payments.p2sh({ redeem: p2wpkh, network: network });
            utxo.redeemScript = p2sh.redeem.output;
        }
    });

    return utxos;
}
