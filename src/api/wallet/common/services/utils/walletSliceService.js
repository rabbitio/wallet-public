import AddressesDataApi from "../../backend-api/addressesDataApi";
import { getCurrentNetwork, getWalletId } from "../../../../common/services/internal/storage";
import AddressesServiceInternal from "../../../btc/services/internal/addressesServiceInternal";
import { getAllUTXOs } from "../../../btc/services/utils/utxosUtils";
import { logError } from "../../../../common/utils/errorUtils";
import { Coins } from "../../../coins";
import { BalancesService } from "../balancesService";
import { Wallets } from "../../wallets";
import { transactionsDataProvider } from "../../../btc/services/internal/transactionsDataProvider";

export class WalletSliceService {
    static async getCurrentWalletDataSliceString() {
        try {
            // TODO: [bug, critical] add independent errors hadling per data part to avoid failing all data sclice if specific call fails
            const indexes = await AddressesDataApi.getAddressesIndexes(getWalletId());
            const wallets = Wallets.getWalletsForAllSupportedCoins();
            let addressesBtc = await AddressesServiceInternal.getAllUsedAddresses();
            let utxos = await getAllUTXOs(addressesBtc.internal, addressesBtc.external, getCurrentNetwork());
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
            logError(e, "getCurrentWalletDataSliceString");
        }
    }
}
