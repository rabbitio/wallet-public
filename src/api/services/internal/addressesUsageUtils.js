import { performNoBatchTransactionsDataRetrieval } from "../../external-apis/noBatchTransactionsAPI";
import { transactionsDataProvider } from "./transactionsDataProvider";
import { improveAndRethrow, logError } from "../../utils/errorUtils";
import { MAX_COUNT_OF_ATTEMPTS_FOR_DATA_RETRIEVAL } from "../../../properties";

export class AddressesUsageUtils {
    /**
     * Calculates whether given addresses are used
     * @param addresses - addresses to calculate usage for
     * @param network - network of addresses
     * @return {Promise<Array<boolean>>} - Array of flags - true means that address at the same index in the given array
     *                                     is used, false means that address not used
     */
    static async getAddressesUsage(addresses, network) {
        try {
            const transactions = await performNoBatchTransactionsDataRetrieval(
                addresses,
                network,
                null,
                [],
                MAX_COUNT_OF_ATTEMPTS_FOR_DATA_RETRIEVAL
            );

            try {
                await transactionsDataProvider.updateTransactionsCacheAndPushTxsToServer(transactions);
            } catch (e) {
                logError(e, "getAddressesUsage", "Failed to update transactions cache");
            }

            return addresses.map(address => {
                const transactionsOfAddress = transactions.filter(
                    tx =>
                        tx.inputs.filter(input => input.address === address).length > 0 ||
                        tx.outputs.filter(
                            output => output.addresses.filter(outputAddress => outputAddress === address).length > 0
                        ).length > 0
                );
                return transactionsOfAddress.length > 0;
            });
        } catch (e) {
            improveAndRethrow(e, "getAddressesUsage");
        }
    }
}
