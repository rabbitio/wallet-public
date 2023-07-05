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
import { createRawBalanceAtomsCacheProcessorForSingleBalanceProvider } from "../../../common/utils/cacheActualizationUtils";
import { BALANCE_CHANGED_EXTERNALLY_EVENT, EventBus } from "../../../../common/adapters/eventbus";
import { Coins } from "../../../coins";

export default class UtxosService {
    static _balanceCacheAndRequestsResolver = new CacheAndConcurrentRequestsResolver(
        "btc_utxosService",
        100000,
        110,
        1000,
        false
    );
    static _balanceCacheId = "balances_03682d38-6c21-49d7-a1cf-c24a8ecfe3e7";

    static markBtcBalanceCacheAsExpired() {
        try {
            this._balanceCacheAndRequestsResolver.markAsExpiredButDontRemove(this._balanceCacheId);
        } catch (e) {
            improveAndRethrow(e, "markBtcBalanceCacheAsExpired");
        }
    }

    static actualizeBalanceCacheWithAmountAtoms(amountAtoms, sign) {
        try {
            const cacheProcessorForSingleValue = createRawBalanceAtomsCacheProcessorForSingleBalanceProvider(
                amountAtoms,
                sign
            );
            const cacheProcessor = cached => {
                // Here for simplicity we actualize only the "spendable" BTC balance as it is used as major balance value now all over the app
                const spendable = cached?.spendable;
                if (spendable) {
                    const subResult = cacheProcessorForSingleValue(spendable);
                    return { isModified: true, data: { ...cached, spendable: +subResult.data } };
                }
                return { isModified: false, data: cached };
            };
            this._balanceCacheAndRequestsResolver.actualizeCachedData(this._balanceCacheId, cacheProcessor);
        } catch (e) {
            improveAndRethrow(e, "actualizeBalanceCacheWithAmountAtoms");
        }
    }

    /**
     * Retrieves a list of all UTXOs that can be used for new outgoing transaction creation
     *
     * @param [allAddresses=null] {{ internal: string[], external: string[] }} if you need to
     *        get UTXOs related to only these addresses
     * @return {Promise<Utxo[]>}
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
     * All returned values are in satoshi denomination.
     *
     * @param [feeRate=null] {FeeRate} optional FeeRate object if you need to calculate also dust balance amount in terms of this rate
     * @param [forceCalculate=false] {boolean} whether to ignore cached balance and calculate it from scratch
     * @return {Promise<{
     *         unconfirmed: number,
     *         spendable: number,
     *         signable: number,
     *         confirmed: number,
     *         dust: (number|null)
     *     }>}
     */
    static async calculateBalance(feeRate = null, forceCalculate = false) {
        const loggerSource = "calculateBalance";
        try {
            const result = await this._balanceCacheAndRequestsResolver.getCachedResultOrWaitForItIfThereIsActiveCalculation(
                this._balanceCacheId
            );
            if (!result.canStartDataRetrieval) {
                return result?.cachedData;
            }
            const network = getCurrentNetwork();
            const indexes = await AddressesDataApi.getAddressesIndexes(getWalletId());
            const allAddresses = await AddressesServiceInternal.getAllUsedAddresses(indexes);
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

            if (
                result?.cachedData?.spendable != null &&
                result.cachedData.spendable !== balanceValuesAndDust?.spendable
            ) {
                EventBus.dispatch(BALANCE_CHANGED_EXTERNALLY_EVENT, null, [Coins.COINS.BTC.ticker]);
            }
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
