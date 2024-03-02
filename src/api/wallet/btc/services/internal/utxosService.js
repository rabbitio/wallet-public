import { improveAndRethrow } from "@rabbitio/ui-kit";

import { Utxos } from "../../lib/utxos.js";
import { Storage } from "../../../../common/services/internal/storage.js";
import { BtcUtxosUtils } from "../utils/utxosUtils.js";
import AddressesDataApi from "../../../common/backend-api/addressesDataApi.js";
import AddressesServiceInternal from "./addressesServiceInternal.js";
import { Logger } from "../../../../support/services/internal/logs/logger.js";
import { CacheAndConcurrentRequestsResolver } from "../../../../common/services/utils/robustExteranlApiCallerService/cacheAndConcurrentRequestsResolver.js";
import { createRawBalanceAtomsCacheProcessorForSingleBalanceProvider } from "../../../common/utils/cacheActualizationUtils.js";
import { BALANCE_CHANGED_EXTERNALLY_EVENT, EventBus } from "../../../../common/adapters/eventbus.js";
import { Coins } from "../../../coins.js";
import { STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS } from "../../../../common/utils/ttlConstants.js";

export default class UtxosService {
    static _balanceCacheAndRequestsResolver = new CacheAndConcurrentRequestsResolver(
        "btc_utxosService",
        STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS,
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
            const balanceCacheProcessor = createRawBalanceAtomsCacheProcessorForSingleBalanceProvider(
                amountAtoms,
                sign
            );
            const cacheProcessor = cached => {
                const result = { isModified: false, data: cached };
                if (cached?.spendable) {
                    result.isModified = true;
                    result.data = { ...result.data, spendable: +balanceCacheProcessor(cached?.spendable)?.data };
                }
                if (cached?.unconfirmed) {
                    result.isModified = true;
                    result.data = { ...result.data, unconfirmed: +balanceCacheProcessor(cached?.unconfirmed)?.data };
                }
                if (cached?.signable) {
                    result.isModified = true;
                    result.data = { ...result.data, signable: +balanceCacheProcessor(cached?.signable)?.data };
                }
                if (cached?.confirmed) {
                    result.isModified = true;
                    result.data = { ...result.data, confirmed: +balanceCacheProcessor(cached?.confirmed)?.data };
                }
                return result;
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
            const network = Storage.getCurrentNetwork();
            if (!allAddresses) {
                allAddresses = await AddressesServiceInternal.getAllUsedAddresses();
            }
            const indexes = await AddressesDataApi.getAddressesIndexes(Storage.getWalletId());
            const allUtxos = await BtcUtxosUtils.getAllUTXOs(allAddresses.internal, allAddresses.external, network);

            return Utxos.getAllSpendableUtxosByWalletData(
                Storage.getAccountsData(),
                allUtxos,
                indexes,
                Storage.getCurrentNetwork()
            );
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
        let result;
        try {
            result = await this._balanceCacheAndRequestsResolver.getCachedOrWaitForCachedOrAcquireLock(
                this._balanceCacheId
            );
            if (!result?.canStartDataRetrieval) {
                return result?.cachedData;
            }
            const network = Storage.getCurrentNetwork();
            const indexes = await AddressesDataApi.getAddressesIndexes(Storage.getWalletId());
            const allAddresses = await AddressesServiceInternal.getAllUsedAddresses(indexes);
            const allUtxos = await BtcUtxosUtils.getAllUTXOs(allAddresses.internal, allAddresses.external, network);

            const utxosToString = utxos => utxos.map(utxo => utxo.toMiniString()).join("\n");
            Logger.log(
                `Recalculating, all UTXOs: internal:\n${utxosToString(allUtxos.internal)}\n` +
                    `external:\n${utxosToString(allUtxos.external)}`,
                loggerSource
            );

            const balanceValues = Utxos.calculateBalanceByWalletData(
                Storage.getAccountsData(),
                allUtxos,
                indexes,
                network
            );
            const dust = feeRate && Utxos.calculateDustBalanceByWalletData(allUtxos, feeRate, network);
            const balanceValuesAndDust = { ...balanceValues, dust: dust ?? null };

            if (
                result?.cachedData?.spendable != null &&
                result.cachedData.spendable !== balanceValuesAndDust?.spendable
            ) {
                EventBus.dispatch(BALANCE_CHANGED_EXTERNALLY_EVENT, null, [Coins.COINS.BTC.ticker]);
            }
            this._balanceCacheAndRequestsResolver.saveCachedData(
                this._balanceCacheId,
                result?.lockId,
                balanceValuesAndDust
            );
            Logger.log(`Returning balance: ${JSON.stringify(balanceValuesAndDust)}`, loggerSource);
            return balanceValuesAndDust;
        } catch (e) {
            improveAndRethrow(e, loggerSource);
        } finally {
            this._balanceCacheAndRequestsResolver.releaseLock(this._balanceCacheId, result?.lockId);
        }
    }
}
