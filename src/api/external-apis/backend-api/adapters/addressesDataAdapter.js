export default class AddressesDataAdapter {
    /**
     * Returns index of address node by derivation path.
     * If specified path has not been used yet then returns 0.
     *
     * @param addressesIndexes - object of indexes returned from server
     * @param path - path to index
     * @return number - index, -1 if no index present on server
     */
    static getIndexByPath(addressesIndexes, path) {
        const desiredIndexData = addressesIndexes.find(indexData => indexData.path === path);
        if (!desiredIndexData) {
            return -1;
        }

        return desiredIndexData.index;
    }

    static toServerFormatOfInitialIndexesData(path, index) {
        return [{ p: path, i: index }];
    }

    static toServerFormatOfInitialAddressesData(addressUUID, encryptedAddressesData) {
        return [
            {
                h: addressUUID,
                encData: encryptedAddressesData,
            },
        ];
    }
}
