import {
    calculateBalanceByWalletData,
    calculateDustBalanceByWalletData,
    getAllSpendableUtxosByWalletData,
} from "../../lib/utxos";
import { getAccountsData, getCurrentNetwork, getWalletId } from "./storage";
import { getAllUTXOs } from "../utils/utxosUtils";
import AddressesDataApi from "../../external-apis/backend-api/addressesDataApi";
import AddressesServiceInternal from "./addressesServiceInternal";
import { improveAndRethrow } from "../../utils/errorUtils";

export default class UtxosService {
    static _cachedBalanceData = {};
    static CACHE_LIFETIME_MS = 30 * 1000;

    /**
     * Retrieves a list of all UTXOs that can be used for new outgoing transaction creation
     *
     * @param allAddresses (optional) - custom addresses object { internal: Array, external: Array } if you need to
     *        get UTXOs related to only these addresses
     * @return Promise resolving to array of UTXO data objects
     */
    // TODO: [tests, critical] At least integration
    static async getAllSpendableUtxos(allAddresses = null) {
        try {
            const network = getCurrentNetwork();
            if (!allAddresses) {
                allAddresses = await AddressesServiceInternal.getAllUsedAddresses();
            }
            const indexes = await AddressesDataApi.getAddressesIndexes(getWalletId());
            const allUtxos = await getAllUTXOs(allAddresses.internal, allAddresses.external, network);

            return getAllSpendableUtxosByWalletData(getAccountsData(), allUtxos, indexes, getCurrentNetwork());
        } catch (e) {
            improveAndRethrow(e, "getAllSpendableUtxos");
        }
    }

    /**
     * Calculates current wallet balance. Uses cached by default. See docs in calculateBalanceByWalletData function.
     *
     * @param feeRate - {FeeRate} - optional FeeRate object if you need to calculate also dust balance amount in terms of this rate
     * @param forceCalculate - whether to ignore cached balance and calculate it from scratch
     * @return {Promise} resolving to object of following format
     *     {
     *         unconfirmed: number of satoshies,
     *         spendable: number of satoshies,
     *         signable: number of satoshies,
     *         confirmed: number of satoshies,
     *         dust: number of satoshis or null
     *     }
     */
    static async calculateBalance(feeRate = null, forceCalculate = false) {
        try {
            if (
                !this._cachedBalanceData?.balanceValues ||
                Date.now() > (this._cachedBalanceData?.expiresAt || 0) ||
                forceCalculate
            ) {
                const network = getCurrentNetwork();
                const [allAddresses, indexes] = await Promise.all([
                    AddressesServiceInternal.getAllUsedAddresses(),
                    AddressesDataApi.getAddressesIndexes(getWalletId()),
                ]);

                // eslint-disable-next-line no-console
                console.log("BALANCE Addresses: " + JSON.stringify(allAddresses));

                const allUtxos = await getAllUTXOs(allAddresses.internal, allAddresses.external, network);

                // eslint-disable-next-line no-console
                console.log("BALANCE UTXOs: " + JSON.stringify(allUtxos));

                const balanceValues = calculateBalanceByWalletData(getAccountsData(), allUtxos, indexes, network);

                // eslint-disable-next-line no-console
                console.log("BALANCE BALANCE: " + JSON.stringify(balanceValues));

                const dust = feeRate && calculateDustBalanceByWalletData(allUtxos, feeRate, network);
                this._cachedBalanceData = {
                    balanceValues: { ...balanceValues, dust: dust ?? null },
                    expiresAt: Date.now() + this.CACHE_LIFETIME_MS,
                };
            }

            return { ...this._cachedBalanceData.balanceValues };
        } catch (e) {
            improveAndRethrow(e, "calculateBalance");
        }
    }
}
