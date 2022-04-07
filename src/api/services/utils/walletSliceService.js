import AddressesDataApi from "../../external-apis/backend-api/addressesDataApi";
import { getCurrentNetwork, getWalletId } from "../internal/storage";
import AddressesServiceInternal from "../internal/addressesServiceInternal";
import { getAllUTXOs } from "./utxosUtils";
import { getCurrentSmallestFeeRate } from "../feeRatesService";
import PaymentService from "../paymentService";
import UtxosService from "../internal/utxosService";
import { transactionsDataProvider } from "../internal/transactionsDataProvider";
import { logError } from "../../utils/errorUtils";

export class WalletSliceService {
    static async getCurrentWalletDataSliceString() {
        try {
            const indexes = await AddressesDataApi.getAddressesIndexes(getWalletId());
            let addresses = await AddressesServiceInternal.getAllUsedAddresses();
            let utxos = await getAllUTXOs(addresses.internal, addresses.external, getCurrentNetwork());
            const rate = await getCurrentSmallestFeeRate(getCurrentNetwork(), PaymentService.BLOCKS_COUNTS_FOR_OPTIONS);
            let balance = await UtxosService.calculateBalance(rate);
            let transactions = (
                await transactionsDataProvider.getTransactionsByAddresses([
                    ...addresses.internal,
                    ...addresses.external,
                ])
            ).map(
                tx =>
                    `tx:${tx.txid};${tx.confirmations};${tx.time};${tx.fee_satoshis};${tx.double_spend};${tx.inputs
                        .map(
                            inp =>
                                `in:${inp.address.slice(0, 8)},${inp.value_satoshis},${inp.txid.slice(0, 5)},${
                                    inp.output_number
                                }`
                        )
                        .join("|")};${tx.outputs
                        .map(
                            out =>
                                `out:${out.addresses[0].slice(0, 8)},${out.value_satoshis},${out.number},${(
                                    out.spend_txid ?? ""
                                ).slice(0, 5)}`
                        )
                        .join("|")}\n`
            );

            let walletSlice = "Indexes:\n" + indexes.map(item => `${item.path}:${item.index}`).join("\n") + "\n";
            walletSlice += "Addresses internal:\n" + addresses.internal.join(",") + "\n";
            walletSlice += "Addresses external:\n" + addresses.external.join(",") + "\n";
            walletSlice += "UTXOS internal:\n" + utxos.internal.map(utxo => utxo.toMiniString()).join("\n") + "\n";
            walletSlice += "UTXOS external:\n" + utxos.external.map(utxo => utxo.toMiniString()).join("\n") + "\n";
            walletSlice += `Balance:\n${JSON.stringify(balance)}\n`;
            walletSlice += `Transactions:\n${transactions}`;

            return walletSlice;
        } catch (e) {
            logError(e, "getCurrentWalletDataSliceString");
        }
    }
}
