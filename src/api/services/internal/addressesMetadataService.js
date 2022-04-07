import AddressesService from "../addressesService";
import AddressesServiceInternal from "./addressesServiceInternal";

import { improveAndRethrow } from "../../utils/errorUtils";

/**
 * Provides API to track metadata for addresses
 */
class AddressesMetadataService {
    constructor() {
        this._addressesMetadata = [];
    }

    /**
     * Returns addresses that are:most recent
     * - frequent: have more than 3 transactions and last one during last 30 days
     * - 3 most recent for currently selected addresses type (both external and internal)
     * - 1 most recent for alternative addresses type (both external and internal)
     * @return {Promise<Array<string>>}
     */
    async getAddressesForFrequentScanning() {
        const addressType = await AddressesService.getAddressesType();
        const alternativeType =
            addressType === AddressesService.ADDRESSES_TYPES.SEGWIT
                ? AddressesService.ADDRESSES_TYPES.LEGACY
                : AddressesService.ADDRESSES_TYPES.SEGWIT;
        const lastAddresses = await AddressesService.getLastAddresses([
            { count: 2, change: false, type: addressType },
            { count: 1, change: true, type: addressType },
            { count: 1, change: false, type: alternativeType },
            { count: 1, change: true, type: alternativeType },
        ]);

        const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const frequentAddresses = this._addressesMetadata
            .filter(addressMetadata => addressMetadata.txsCount > 3 && addressMetadata.lastTxTimestamp > monthAgo)
            .map(addressMetadata => addressMetadata.address);

        return [...frequentAddresses, ...lastAddresses];
    }

    /**
     * Recalculates metadata by given transactions array and array of last update timestamps for addresses
     *
     * @param transactions {Array<Transaction>}
     * @param addressesUpdateTimestamps {Array<{address: string, timestamp: number}>}
     * @return {Promise<void>}
     */
    async recalculateAddressesMetadataByTransactions(transactions, addressesUpdateTimestamps = []) {
        try {
            const allAddresses = await AddressesServiceInternal.getAllUsedAddresses();
            this._addressesMetadata = [...allAddresses.internal, ...allAddresses.external].map(address => {
                const txs = transactions.filter(
                    tx =>
                        tx.inputs.find(input => input.address === address) ||
                        tx.outputs.find(output => output.addresses.find(outAddress => outAddress === address))
                );

                return {
                    address: address,
                    txsCount: txs.length,
                    lastTxTimestamp:
                        txs.reduce((prev, tx) => ((tx.time || 0) > (prev?.time || 0) ? tx : prev), null)?.time || null,
                    lastUpdateTimestamp:
                        addressesUpdateTimestamps.find(item => item.address === address)?.timestamp ||
                        this._addressesMetadata.find(item => item.address === address)?.lastUpdateTimestamp ||
                        null,
                };
            });
        } catch (e) {
            improveAndRethrow(e, "recalculateAddressesMetadataByTransactions");
        }
    }

    /**
     * Returns list of all addresses counted in this service sorted by the last update timestamp
     * @return {Array<string>}
     */
    getAddressesSortedByLastUpdateDate() {
        this._addressesMetadata.sort((m1, m2) =>
            m1.lastUpdateTimestamp == null
                ? m2.lastUpdateTimestamp == null
                    ? 0
                    : -1
                : m2.lastUpdateTimestamp == null
                ? 1
                : m1.lastUpdateTimestamp - m2.lastUpdateTimestamp
        );

        return this._addressesMetadata.map(metadata => metadata.address);
    }

    /**
     * Clears all stored metadata. Useful when we sign out or delete wallet
     */
    clearMetadata() {
        this._addressesMetadata = [];
    }
}

export const addressesMetadataService = new AddressesMetadataService();
