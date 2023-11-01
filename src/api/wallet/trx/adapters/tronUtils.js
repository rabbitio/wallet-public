import { ethers } from "ethers";
import TronWebLib from "tronweb";

import { getCurrentNetwork } from "../../../common/services/internal/storage";
import { Coins } from "../../coins";
import { improveAndRethrow } from "../../../common/utils/errorUtils";
import { safeStringify } from "../../../common/utils/browserUtils";
import { API_KEYS_PROXY_URL } from "../../../common/backend-api/utils";
import { ApiGroups } from "../../../common/external-apis/apiGroups";

const url = `${API_KEYS_PROXY_URL}/${ApiGroups.TRONGRID.backendProxyIdGenerator(Coins.COINS.TRX.mainnet)}`;
const urlTestnet = `${API_KEYS_PROXY_URL}/${ApiGroups.TRONGRID.backendProxyIdGenerator(Coins.COINS.TRX.testnet)}`;

class TronUtils {
    constructor() {
        const fullNode = new TronWebLib.providers.HttpProvider(url);
        const solidityNode = new TronWebLib.providers.HttpProvider(url);
        const eventServer = new TronWebLib.providers.HttpProvider(url);
        this._lib = new TronWebLib(fullNode, solidityNode, eventServer);
        this._libTestnet = null; // Will be initialized lazily
    }

    _getLibByCurrentNetwork() {
        try {
            if (getCurrentNetwork(Coins.COINS.TRX) === Coins.COINS.TRX.mainnet) {
                return this._lib;
            }
            if (this._libTestnet == null) {
                // Lazy initializing the testnet only if it is requested
                const fullNodeTestnet = new TronWebLib.providers.HttpProvider(urlTestnet);
                const solidityNodeTestnet = new TronWebLib.providers.HttpProvider(urlTestnet);
                const eventServerTestnet = new TronWebLib.providers.HttpProvider(urlTestnet);
                this._libTestnet = new TronWebLib(fullNodeTestnet, solidityNodeTestnet, eventServerTestnet);
            }
            return this._libTestnet;
        } catch (e) {
            improveAndRethrow(e, "_getLibByCurrentNetwork");
        }
    }

    /**
     * Converts the standard Tron blockchain address to hex format used by some APIs
     *
     * @param address {string} base58check address string (starts with 'T')
     * @returns {string} hex address string (starts with '41')
     */
    base58checkAddressToHex(address) {
        return this._getLibByCurrentNetwork().address.toHex(address);
    }

    /**
     * Converts the hex tron address to base58 format (mostly used)
     *
     * @param address {string} hex address string (starts with '41')
     * @returns {string} base58check address string (starts with 'T')
     */
    hexAddressToBase58check(address) {
        return this._getLibByCurrentNetwork().address.fromHex(address);
    }

    isAddressValid(address) {
        return this._getLibByCurrentNetwork().isAddress(address);
    }

    /**
     * TODO: [refactoring, moderate] encapsulate TRC20 specific function (types passing)
     * Encodes params for contract execution.
     * This code is taken from https://developers.tron.network/docs/parameter-and-return-value-encoding-and-decoding
     *
     * @param inputs {{ type: string, value: any }[]} param type and value
     * @returns {string} encoded params string
     */
    encodeParams(inputs) {
        try {
            const AbiCoder = ethers.utils.AbiCoder;
            const ADDRESS_PREFIX_REGEX = /^(41)/;
            let typesValues = inputs;
            let parameters = "";

            if (typesValues.length === 0) {
                return parameters;
            }
            const abiCoder = new AbiCoder();
            let types = [];
            const values = [];
            for (let i = 0; i < typesValues.length; i++) {
                let { type, value } = typesValues[i];
                if (type === "address") {
                    value = value.replace(ADDRESS_PREFIX_REGEX, "0x");
                } else if (type === "address[]") {
                    value = value.map(v => this.base58checkAddressToHex(v).replace(ADDRESS_PREFIX_REGEX, "0x"));
                }
                types.push(type);
                values.push(value);
            }

            parameters = abiCoder.encode(types, values).replace(/^(0x)/, "");

            return parameters;
        } catch (e) {
            improveAndRethrow(e, "encodeParams");
        }
    }

    decodeTrc20TransferParams(rawTransactionDataString) {
        return this._decodeParams(["address", "uint256"], rawTransactionDataString, true);
    }

    /**
     * Decodes raw transaction data into params used for contract calling
     *
     * @param types {string[]} types strings in order they appear in the decoding string
     * @param output {string} the contract-specific data string from transaction
     * @param [ignoreMethodHash=true] optional true by default - removes the 4 bytes method hash like 'a9059cbb' for trc20 transfer
     * @returns {any[]} array of value parsed from transaction data string
     * @private
     * @description https://developers.tron.network/docs/parameter-and-return-value-encoding-and-decoding
     */
    _decodeParams(types, output, ignoreMethodHash = true) {
        try {
            const ADDRESS_PREFIX = "41";
            if (!output || typeof output === "boolean") {
                ignoreMethodHash = output;
                output = types;
            }

            if (ignoreMethodHash && output.replace(/^0x/, "").length % 64 === 8) {
                output = "0x" + output.replace(/^0x/, "").substring(8);
            }

            if (output.replace(/^0x/, "").length % 64)
                throw new Error("The encoded string is not valid. Its length must be a multiple of 64.");
            const abiCoder = new ethers.utils.AbiCoder();
            const decoded = abiCoder.decode(types, output);
            if (!Array.isArray(decoded)) throw new Error("Failed to decode TRC20 transaction data string: " + output);
            return decoded.reduce((obj, arg, index) => {
                if (types[index] === "address") arg = ADDRESS_PREFIX + arg.slice(2).toLowerCase();
                obj.push(arg);
                return obj;
            }, []);
        } catch (e) {
            improveAndRethrow(e, "_decodeParams");
        }
    }

    isTrc20TransferMethodId(id) {
        return (id ?? "").toLowerCase() === "a9059cbb";
    }

    async _buildTrxTransferTransactionInternalFormat(fromAddressBase58, toAddressBase58, amountAtomsString) {
        try {
            return await this._getLibByCurrentNetwork().transactionBuilder.sendTrx(
                toAddressBase58,
                +amountAtomsString, // Should be a number for "sendTrx" call
                fromAddressBase58
            );
        } catch (e) {
            improveAndRethrow(e, "_buildTrxTransferTransactionInternalFormat");
        }
    }

    /**
     * Builds TRX transfer transaction (protocol transaction type = 1) and returns hex representation
     *
     * @param fromAddressBase58 {string} sending address base58check format
     * @param toAddressBase58 {string} receiving address base58check format
     * @param amountAtomsString {string} amount to be sent (in "suns")
     * @return {Promise<string|null>} hex transaction or null if failed to create a transaction by library
     */
    async buildTrxTransferTransactionHex(fromAddressBase58, toAddressBase58, amountAtomsString) {
        try {
            const unsignedTransaction = await this._buildTrxTransferTransactionInternalFormat(
                fromAddressBase58,
                toAddressBase58,
                amountAtomsString
            );
            return unsignedTransaction?.raw_data_hex ?? null;
        } catch (e) {
            improveAndRethrow(e, "buildTrxTransferTransactionHex");
        }
    }

    async _signAndBroadcastTransaction(unsignedTransaction, privateKey) {
        try {
            const signedTransaction = await this._getLibByCurrentNetwork().trx.sign(unsignedTransaction, privateKey);
            const result = await this._getLibByCurrentNetwork().trx.sendRawTransaction(signedTransaction);
            const id = result?.transaction?.txID;
            if (!id) throw new Error("Failed to broadcast transaction: " + safeStringify(unsignedTransaction));
            return id;
        } catch (e) {
            improveAndRethrow(e, "_signAndBroadcastTransaction");
        }
    }

    /**
     * Builds, signs and send TRX TransferContract transaction.
     *
     * @param fromAddressBase58 {string} sending address base58check format
     * @param toAddressBase58 {string} receiving address base58check format
     * @param amountAtomsString {string} amount to be sent (in "suns")
     * @param privateKey {string} private key to sign the transaction
     * @return {Promise<string>} id of published transaction
     */
    async createSignAndBroadcastTrxTransferTransaction(
        fromAddressBase58,
        toAddressBase58,
        amountAtomsString,
        privateKey
    ) {
        try {
            const unsigned = await this._buildTrxTransferTransactionInternalFormat(
                fromAddressBase58,
                toAddressBase58,
                amountAtomsString
            );
            return await this._signAndBroadcastTransaction(unsigned, privateKey);
        } catch (e) {
            improveAndRethrow(e, "createSignAndBroadcastTrxTransferTransaction");
        }
    }

    async _buildTrc20TransferTransactionInternalFormat(
        contractAddressBase58,
        fromAddressBase58,
        toAddressBase58,
        amountAtomsString,
        feeLimitSuns = 100_000_000
    ) {
        try {
            const contractAddressHex = this.base58checkAddressToHex(contractAddressBase58);
            const fromAddressHex = this.base58checkAddressToHex(fromAddressBase58);
            const toAddressHex = this.base58checkAddressToHex(toAddressBase58);
            const parameter = [
                { type: "address", value: toAddressHex },
                { type: "uint256", value: amountAtomsString },
            ];
            const options = { feeLimit: feeLimitSuns, callValue: 0 }; // TRX transfer is 0 for TRC20 contracts
            return await this._getLibByCurrentNetwork().transactionBuilder.triggerSmartContract(
                contractAddressHex,
                "transfer(address,uint256)",
                options,
                parameter,
                fromAddressHex
            );
        } catch (e) {
            improveAndRethrow(e, "_buildTrc20TransferTransactionInternalFormat");
        }
    }

    /**
     * Builds TRC20 transfer transaction (protocol transaction type = 31) and returns hex representation
     *
     * @param contractAddressBase58 {string} address of smart contract in base58check format
     * @param fromAddressBase58 {string} sending address base58check format
     * @param toAddressBase58 {string} receiving address base58check format
     * @param amountAtomsString {string} amount to be sent (in token atoms)
     * @param feeLimitSuns {number} max TRX in suns that can be burned to perform this transaction
     * @return {Promise<string|null>} hex transaction or null if failed to create a transaction by library
     */
    async buildTrc20TransferTransactionHex(
        contractAddressBase58,
        fromAddressBase58,
        toAddressBase58,
        amountAtomsString,
        feeLimitSuns = 100000000
    ) {
        try {
            const result = await this._buildTrc20TransferTransactionInternalFormat(
                contractAddressBase58,
                fromAddressBase58,
                toAddressBase58,
                amountAtomsString,
                feeLimitSuns
            );
            return result?.transaction?.raw_data_hex ?? null;
        } catch (e) {
            improveAndRethrow(e, "buildTrc20TransferTransactionHex");
        }
    }

    /**
     * Builds, signs and sends TRC20 TriggerSmartContract transaction transferring specified amount to specified address.
     *
     * @param contractAddressBase58 {string} address of smart contract in base58check format
     * @param fromAddressBase58 {string} sending address base58check format
     * @param toAddressBase58 {string} receiving address base58check format
     * @param amountAtomsString {string} amount to be sent (in token atoms)
     * @param privateKey {string} private key to sign the transaction
     * @param feeLimitSuns {number} max TRX in suns that can be burned to perform this transaction
     * @return {Promise<string>} id of published transaction
     */
    async createSignAndBroadcastTrc20TransferTransaction(
        contractAddressBase58,
        fromAddressBase58,
        toAddressBase58,
        amountAtomsString,
        privateKey,
        feeLimitSuns = 100_000_000
    ) {
        try {
            const unsigned = await this._buildTrc20TransferTransactionInternalFormat(
                contractAddressBase58,
                fromAddressBase58,
                toAddressBase58,
                amountAtomsString,
                feeLimitSuns
            );
            return await this._signAndBroadcastTransaction(unsigned.transaction, privateKey);
        } catch (e) {
            improveAndRethrow(e, "createSignAndBroadcastTrc20TransferTransaction");
        }
    }
}

export const tronUtils = new TronUtils();
