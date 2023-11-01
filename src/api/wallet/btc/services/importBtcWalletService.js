import { Logger } from "../../../support/services/internal/logs/logger";
import AddressesServiceInternal from "./internal/addressesServiceInternal";
import { SupportedSchemes } from "../lib/addresses-schemes";
import { getCurrentNetwork } from "../../../common/services/internal/storage";

export class ImportBtcWalletService {
    static async grabBtcWalletHistoricalDataAndSave() {
        const loggerSource = "grabBtcWalletHistoricalDataAndSave";
        try {
            await AddressesServiceInternal.performScanningOfAddresses([getCurrentNetwork()], SupportedSchemes);

            Logger.log("Addresses scanning performed successfully during the import", loggerSource);
        } catch (e) {
            Logger.log("Failed to grab wallet data import: " + e.message, loggerSource);
            return { result: false };
        }
    }
}
