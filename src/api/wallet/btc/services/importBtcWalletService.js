import { Logger } from "../../../support/services/internal/logs/logger";
import AddressesServiceInternal from "./internal/addressesServiceInternal";
import { SupportedSchemes } from "../lib/addresses-schemes";
import { transactionsDataProvider } from "./internal/transactionsDataProvider";
import { getCurrentNetwork } from "../../../common/services/internal/storage";

export class ImportBtcWalletService {
    static async grabBtcWalletHistoricalDataAndSave() {
        const loggerSource = "grabBtcWalletHistoricalDataAndSave";
        try {
            await AddressesServiceInternal.performScanningOfAddresses([getCurrentNetwork()], SupportedSchemes);

            Logger.log("Addresses scanning performed successfully during the import", loggerSource);

            await transactionsDataProvider.waitForTransactionsToBeStoredOnServer(30000);

            Logger.log("Transactions successfully discovered during the import", loggerSource);
        } catch (e) {
            Logger.log("Failed to grab wallet data import: " + e.message, loggerSource);
            return { result: false };
        }
    }
}
