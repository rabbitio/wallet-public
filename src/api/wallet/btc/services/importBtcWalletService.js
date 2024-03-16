import { Logger } from "@rabbitio/ui-kit";

import AddressesServiceInternal from "./internal/addressesServiceInternal.js";
import { SupportedSchemes } from "../lib/addresses-schemes.js";
import { Storage } from "../../../common/services/internal/storage.js";

export class ImportBtcWalletService {
    static async grabBtcWalletHistoricalDataAndSave() {
        const loggerSource = "grabBtcWalletHistoricalDataAndSave";
        try {
            await AddressesServiceInternal.performScanningOfAddresses([Storage.getCurrentNetwork()], SupportedSchemes);

            Logger.log("Addresses scanning performed successfully during the import", loggerSource);
        } catch (e) {
            Logger.log("Failed to grab wallet data import: " + e.message, loggerSource);
            return { result: false };
        }
    }
}
