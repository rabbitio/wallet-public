import {
    calculateBalanceByWalletData,
    calculateDustBalanceByWalletData,
    getAllSpendableUtxosByWalletData,
} from "../../lib/utxos";
import { getAccountsData, getCurrentNetwork, getWalletId } from "../../../../common/services/internal/storage";
import { getAllUTXOs } from "../utils/utxosUtils";
import AddressesDataApi from "../../../common/backend-api/addressesDataApi";
import AddressesServiceInternal from "./addressesServiceInternal";
import { improveAndRethrow } from "../../../../common/utils/errorUtils";
import { Logger } from "../../../../support/services/internal/logs/logger";
import { CacheAndConcurrentRequestsResolver } from "../../../../common/services/utils/robustExteranlApiCallerService/cacheAndConcurrentRequestsResolver";

export default class UtxosService {
    static _balanceCacheAndRequestsResolver = new CacheAndConcurrentRequestsResolver(
        "btc_utxosService",
        30000,
        65,
        1000
    );
    static _balanceCacheId = "balances_03682d38-6c21-49d7-a1cf-c24a8ecfe3e7";

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
        const loggerSource = "calculateBalance";
        try {
            const cached = await this._balanceCacheAndRequestsResolver.getCachedResultOrWaitForItIfThereIsActiveCalculation(
                this._balanceCacheId
            );
            if (cached) {
                return cached;
            }
            const network = getCurrentNetwork();
            const [allAddresses, indexes] = await Promise.all([
                AddressesServiceInternal.getAllUsedAddresses(),
                AddressesDataApi.getAddressesIndexes(getWalletId()),
            ]);

            const allUtxos = await getAllUTXOs(allAddresses.internal, allAddresses.external, network);

            const utxosToString = utxos => utxos.map(utxo => utxo.toMiniString()).join("\n");
            Logger.log(
                `Recalculating, all UTXOs: internal:\n${utxosToString(allUtxos.internal)}\n` +
                    `external:\n${utxosToString(allUtxos.external)}`,
                loggerSource
            );

            const balanceValues = calculateBalanceByWalletData(getAccountsData(), allUtxos, indexes, network);
            const dust = feeRate && calculateDustBalanceByWalletData(allUtxos, feeRate, network);
            const balanceValuesAndDust = { ...balanceValues, dust: dust ?? null };

            this._balanceCacheAndRequestsResolver.saveCachedData(this._balanceCacheId, balanceValuesAndDust);
            Logger.log(`Returning balance: ${JSON.stringify(balanceValuesAndDust)}`, loggerSource);
            return balanceValuesAndDust;
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        } finally {
            this._balanceCacheAndRequestsResolver.markActiveCalculationAsFinished(this._balanceCacheId);
        }
    }
}
