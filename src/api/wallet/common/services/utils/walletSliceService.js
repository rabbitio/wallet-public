import { Logger } from "@rabbitio/ui-kit";

import AddressesDataApi from "../../backend-api/addressesDataApi.js";
import { Storage } from "../../../../common/services/internal/storage.js";
import AddressesServiceInternal from "../../../btc/services/internal/addressesServiceInternal.js";
import { BtcUtxosUtils } from "../../../btc/services/utils/utxosUtils.js";
import { Coins } from "../../../coins.js";
import { BalancesService } from "../balancesService.js";
import { Wallets } from "../../wallets.js";
import { transactionsDataProvider } from "../../../btc/services/internal/transactionsDataProvider.js";

export class WalletSliceService {
    static async getCurrentWalletDataSliceString() {
        try {
            // TODO: [bug, critical] add independent errors handling per data part to avoid failing all data slice if specific call fails
            const indexes = await AddressesDataApi.getAddressesIndexes(Storage.getWalletId());
            const wallets = Wallets.getWalletsForAllEnabledCoins();
            let addressesBtc = await AddressesServiceInternal.getAllUsedAddresses(indexes);
            let utxos = await BtcUtxosUtils.getAllUTXOs(
                addressesBtc.internal,
                addressesBtc.external,
                Storage.getCurrentNetwork()
            );
            let balances = await BalancesService.getBalances(wallets);
            let transactionsBtc = (
                await transactionsDataProvider.getTransactionsByAddresses([
                    ...addressesBtc.internal,
                    ...addressesBtc.external,
                ])
            ).map(
                tx =>
                    `tx:${tx.txid};${tx.confirmations};${tx.time};${tx.fee_satoshis};${tx.double_spend};${tx.inputs
                        .map(
                            inp =>
                                `in:${typeof inp?.address === "string" ? inp?.address?.slice(0, 8) : ""},${
                                    inp.value_satoshis
                                },${typeof inp?.txid === "string" ? inp?.txid.slice(0, 5) : ""},${inp.output_number}`
                        )
                        .join("|")};${tx.outputs
                        .map(
                            out =>
                                `out_${out.number}:${
                                    typeof out.addresses[0] === "string" ? out.addresses[0]?.slice(0, 8) : ""
                                },${out.value_satoshis},${
                                    typeof out?.spend_txid === "string" ? out.spend_txid.slice(0, 5) : ""
                                }`
                        )
                        .join("|")}\n`
            );

            const transactionsOtherCoins = await Promise.all(
                wallets.filter(w => w.coin !== Coins.COINS.BTC).map(w => w.getTransactionsList())
            );

            const addressesOtherCoins = await Promise.all(wallets.map(w => w.getCurrentAddress()));

            let walletSlice = "Indexes:\n" + indexes.map(item => `${item.path}:${item.index}`).join("\n") + "\n";
            walletSlice += "BTC Addresses internal:\n" + addressesBtc.internal.join(",") + "\n";
            walletSlice +=
                "Addresses:\n" +
                JSON.stringify(wallets.map((w, i) => `${w.coin.ticker}:${addressesOtherCoins[i]}`)) +
                "\n";
            walletSlice += "BTC UTXOS internal:\n" + utxos.internal.map(utxo => utxo?.toMiniString()).join("\n") + "\n";
            walletSlice += "BTC UTXOS external:\n" + utxos.external.map(utxo => utxo?.toMiniString()).join("\n") + "\n";
            walletSlice += `Balances:\n${JSON.stringify(wallets.map((w, i) => `${w.coin.ticker}:${balances[i]}`))}\n`;
            walletSlice += `Transactions:\n${transactionsBtc}\n${wallets
                .filter(w => w.coin !== Coins.COINS.BTC)
                .map(
                    (w, i) =>
                        `${w.coin.ticker}:\n${transactionsOtherCoins[i].map(tx => `${JSON.stringify(tx.full_tx)}\n`)}\n`
                )}`;

            return walletSlice;
        } catch (e) {
            Logger.logError(e, "getCurrentWalletDataSliceString");
        }
    }
}
