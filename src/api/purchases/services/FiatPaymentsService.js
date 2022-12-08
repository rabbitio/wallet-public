import { improveAndRethrow } from "../../common/utils/errorUtils";
import { EncryptedWalletPaymentIdsService } from "./encryptedWalletPaymentIdsService";
import FiatPaymentsApi from "../backend-api/fiatPaymentsApi";
import { getWalletId } from "../../common/services/internal/storage";

/**
 * Provides API for purchases of crypto made via ramp.network widget
 */
export default class FiatPaymentsService {
    static async getPaymentsNotifications() {
        try {
            const paymentIds = await EncryptedWalletPaymentIdsService.getPaymentIdsForCurrentWallet();
            if (paymentIds?.length) {
                return await FiatPaymentsApi.getPaymentsNotifications(getWalletId(), paymentIds);
            }

            return [];
        } catch (e) {
            improveAndRethrow(e, "getPaymentsNotifications");
        }
    }

    static async getPurchaseDataForTransactions(txids) {
        try {
            if (txids == null || txids.length === 0) {
                return [];
            }

            const paymentIds = await EncryptedWalletPaymentIdsService.getPaymentIdsForCurrentWallet();

            if (paymentIds?.length) {
                const mappingItems = await FiatPaymentsApi.getTransactionsToPaymentsMapping(getWalletId(), paymentIds);

                return txids.map(txid => {
                    const mappingItem = mappingItems.find(item => item.txid === txid);
                    let purchaseData = null;
                    if (mappingItem) {
                        purchaseData = {
                            paymentId: mappingItem.paymentId,
                            amountWithCurrencyString: `${mappingItem.fiatCurrencyCode} ${mappingItem.fiatAmount}`,
                        };
                    }

                    return { txid, purchaseData };
                });
            }

            return txids.map(txid => ({ txid, purchaseData: null }));
        } catch (e) {
            improveAndRethrow(e, "getPurchaseDataForTransactions");
        }
    }
}
