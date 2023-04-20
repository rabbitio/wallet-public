import xml2js from "xml2js";

import { Logger } from "../../../support/services/internal/logs/logger";
import { EventBus, WALLET_DATA_EXPORTED_EVENT } from "../../../common/adapters/eventbus";
import { Wallets } from "../wallets";

export default class ExportWalletService {
    static downloadedFilenameWithoutExtension = "wallet";

    /**
     * Exports addresses and private keys of the wallet for each coin
     *
     * @param password {string} password of the wallet to export all data
     * @return Promise resolving to { xml: string, csv: string, json: string, js: { address: string, privateKey: string, currency: string }[] }
     */
    static async exportWalletData(password) {
        const loggerSource = "exportWalletData";
        Logger.log(`Start exporting wallet data. Password is empty: ${!!password}`, loggerSource);

        const wallets = Wallets.getWalletsForAllEnabledCoins();
        const data = await Promise.all(wallets.map(wallet => wallet.exportWalletData(password)));
        const exportedDataArray = data
            .map((walletData, index) => walletData.map(item => ({ ...item, currency: wallets[index].coin.ticker })))
            .flat();

        Logger.log(`Returning ${exportedDataArray.length} items`, loggerSource);

        const result = {
            json: toJSON(exportedDataArray),
            csv: toCSV(exportedDataArray),
            xml: toXML(exportedDataArray),
            js: exportedDataArray,
        };

        EventBus.dispatch(WALLET_DATA_EXPORTED_EVENT);

        return result;
    }
}

function toJSON(exportedDataArray) {
    return JSON.stringify(exportedDataArray);
}

function toCSV(exportedDataArray) {
    return exportedDataArray.map(item => `${item.address},${item.privateKey},${item.currency}`).join("\n");
}

function toXML(exportedDataArray) {
    return new xml2js.Builder().buildObject({
        items: exportedDataArray.map(item => {
            return { item };
        }),
    });
}
