import uuid from "uuid";

import { GAP_LIMIT, getAddressByIndex, INTERNAL_CHANGE_INDEX } from "../../lib/addresses";
import { improveAndRethrow } from "../../utils/errorUtils";
import { getDataPassword } from "../internal/storage";
import Address from "../../models/address";
import AddressesDataApi from "../../external-apis/backend-api/addressesDataApi";
import AddressesDataAdapter from "../../external-apis/backend-api/adapters/addressesDataAdapter";
import { AddressesUsageUtils } from "../internal/addressesUsageUtils";

export default class CurrentAddressUtils {
    static async _getCurrentAddress(
        /**
         * Generates current unused addresses (closest to zero index addresses node of HD wallet) for specified
         * schemes, account, change indexes
         *
         * NOTE: class member just for testing. The function itself should not be used as API
         *
         * @param accountsData - accounts data
         * @param network - bitcoin network for which the addresses are generated.
         * @param walletId - id of wallet to work with
         * @param scheme - scheme to retrieve address for
         * @param accountIndex - account index
         * @param changeIndex - change index
         * @param doAddressNodesScanning - whether to perform check of next GAP_LIMIT address nodes to ensure that these nodes are not used
         *                 and increment addresses index in case of used nodes
         * @param skipIfPossible - pass this flag to not to force transactions data loading. It is helpful when this
         *        method is used for addresses scanning and there are a lot of such calls and only last one can trigger
         *        data retrieval to significantly reduce number of calls
         * @return Promise resolving to address string or to null (case when current address index is -1 and doAddressNodesScanning is true and no used address are found)
         */
        accountsData,
        network,
        walletId,
        scheme,
        accountIndex,
        changeIndex,
        doAddressNodesScanning
    ) {
        try {
            const coinIndex = network.coinIndex;
            const path = scheme.getChangeNodePath(coinIndex, accountIndex, changeIndex);
            const addressNodesIndexes = await AddressesDataApi.getAddressesIndexes(walletId);
            const changeNode = scheme.deriveNeuteredChangeNodeForAccount(
                accountsData,
                network,
                accountIndex,
                changeIndex
            );
            const currentAddressIndex = AddressesDataAdapter.getIndexByPath(addressNodesIndexes, path);

            if (currentAddressIndex === -1 && !doAddressNodesScanning) {
                const address0 = getAddressByIndex(scheme, changeNode, 0, network);
                await incrementIndexAndSaveAddressesIfNeeded(
                    walletId,
                    path,
                    changeIndex,
                    [address0],
                    addressNodesIndexes
                );
                return address0;
            }

            let isCurrentAddressNodeUsed = null;
            let currentAddress = null;
            if (currentAddressIndex !== -1) {
                currentAddress = getAddressByIndex(scheme, changeNode, currentAddressIndex, network);
                isCurrentAddressNodeUsed = await isNodeUsed(currentAddress, network);
                if (!isCurrentAddressNodeUsed && !doAddressNodesScanning) {
                    return currentAddress;
                }
            }

            /* Possible cases here: (currentAddressIndex, isNodeUsed, doAddressNodesScanning)
             * -1  null  true
             *  0+ false true
             *  0+ true  true
             *  0+ true  false
             */
            const newAddresses = await scanForNewMissingAddresses(
                scheme,
                changeNode,
                currentAddressIndex,
                isCurrentAddressNodeUsed,
                network
            );
            if (newAddresses.length) {
                await incrementIndexAndSaveAddressesIfNeeded(
                    walletId,
                    path,
                    changeIndex,
                    newAddresses,
                    addressNodesIndexes
                );
                return newAddresses[newAddresses.length - 1];
            }

            return currentAddress;
        } catch (e) {
            improveAndRethrow(e, "_getCurrentAddress", `Address change type: ${changeIndex}`);
        }
    }
}

async function incrementIndexAndSaveAddressesIfNeeded(walletId, path, changeIndex, addresses, addressesIndexes) {
    const dataPassword = getDataPassword();
    if (changeIndex === INTERNAL_CHANGE_INDEX) {
        const baseIndex = AddressesDataAdapter.getIndexByPath(addressesIndexes, path);
        await AddressesDataApi.incrementAddressesIndexOnServer(walletId, path, addresses.length, baseIndex);
    } else {
        const addressesData = addresses.map(address => {
            const addressUUID = uuid.v4();
            const encryptedAddressData = new Address(address, Address.labelAutogenerated).encryptAndSerialize(
                dataPassword
            );
            return { uuid: addressUUID, encryptedAddressData };
        });
        const baseIndex = AddressesDataAdapter.getIndexByPath(addressesIndexes, path);
        await AddressesDataApi.incrementAddressesIndexAndSaveAddressesData(walletId, path, addressesData, baseIndex);
    }
}

async function isNodeUsed(nodeAddress, network) {
    try {
        const usage = await AddressesUsageUtils.getAddressesUsage([nodeAddress], network);
        return usage[0] > 0;
    } catch (e) {
        improveAndRethrow(e, "isNodeUsed");
    }
}

/**
 * Looks up for first unused address node starting from node of currentUsedAddressNodeIndex.
 * Expects that address by given index is used. You should pass -1 index to scan addresses starting from 0 index
 *
 * @param scheme - scheme to create address for
 * @param changeNode - bip44 HD Wallet change node
 * @param currentAddressIndex - index of current address node or -1 (for no current address index case)
 * @param isCurrentAddressUsed - flag signalling whether current address is used or not, should be true/false/null
 * @param network - bitcoin network for which index is looked up
 * @return {Promise<string>} resolving into first unused addresses node index (integer number > 0)
 */
async function scanForNewMissingAddresses(scheme, changeNode, currentAddressIndex, isCurrentAddressUsed, network) {
    try {
        let addressIndex = currentAddressIndex;
        let isUsed = isCurrentAddressUsed;
        let gap = (isCurrentAddressUsed === false && 1) || 0;
        let newAddresses = [];
        const addressesUsageService = AddressesUsageServiceFactory.createInstance(
            scheme,
            changeNode,
            currentAddressIndex + 1,
            network
        );
        while (isUsed || (!isUsed && gap < GAP_LIMIT)) {
            ++addressIndex;
            const addressAndUsage = await addressesUsageService.getAddressAndUsage(addressIndex);
            newAddresses.push(addressAndUsage.address);
            isUsed = addressAndUsage.isUsed;
            gap = isUsed ? 0 : gap + 1;
        }

        newAddresses = newAddresses.slice(0, newAddresses.length - GAP_LIMIT + 1);

        if (currentAddressIndex === -1 && newAddresses.length === 1) {
            // We just have scanned unused branch so no new addresses are being returned
            return [];
        }

        return newAddresses;
    } catch (e) {
        improveAndRethrow(e, "scanForNewMissingAddresses");
    }
}

/**
 * Should not be used outside this module due to pretty proprietary logic.
 */
class AddressesUsageService {
    constructor(scheme, changeNode, addressIndex, network) {
        this.network = network;
        this.startIndex = addressIndex;
        this.changeNode = changeNode;
        this.scheme = scheme;
        this.addresses = [];
        this.usage = [];
    }

    // TODO: [tests, critical] Implement unit tests for this method
    /**
     * Retrieves usage of address by the given index. Uses batch-retrieval of addresses usages info to
     * minimize overhead and caches retrieved data.
     *
     * @param index - index of address to get usage for
     * @return {Promise<{address: *, isUsed: *}>} - address and its usage object
     */
    async getAddressAndUsage(index) {
        if (index >= this.startIndex + this.addresses.length) {
            const currentAddressIndex = this.startIndex + this.addresses.length;
            const tmpAddressesArray = [];
            for (let i = 0; i < GAP_LIMIT; ++i) {
                tmpAddressesArray.push(
                    getAddressByIndex(this.scheme, this.changeNode, currentAddressIndex + i, this.network)
                );
            }
            const tmpUsage = await AddressesUsageUtils.getAddressesUsage(tmpAddressesArray, this.network);

            this.addresses = [...this.addresses, ...tmpAddressesArray];
            this.usage = [...this.usage, ...tmpUsage];
        }

        return { address: this.addresses[index - this.startIndex], isUsed: this.usage[index - this.startIndex] };
    }
}

/**
 * Just for unit testing
 */
export class AddressesUsageServiceFactory {
    static createInstance(scheme, changeNode, addressIndex, network) {
        return new AddressesUsageService(scheme, changeNode, addressIndex, network);
    }
}
