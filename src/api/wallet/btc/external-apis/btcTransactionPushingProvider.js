import RobustExternalAPICallerService from "../../../common/services/utils/robustExteranlApiCallerService/robustExternalAPICallerService";
import { Coins } from "../../coins";
import { ExternalApiProvider } from "../../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { ApiGroups } from "../../../common/external-apis/apiGroups";
import { improveAndRethrow } from "../../../common/utils/errorUtils";

class BlockstreamPostTransactionApiProvider extends ExternalApiProvider {
    constructor() {
        super("https://blockstream.info/", "post", 20000, ApiGroups.BLOCKSTREAM);
    }
    composeQueryString(params, subRequestIndex = 0) {
        try {
            const network = params[1];
            const networkPath = network.key === Coins.COINS.BTC.testnet.key ? "testnet/" : "";
            return `${networkPath}api/tx`;
        } catch (e) {
            improveAndRethrow(e, "BlockstreamPostTransactionApiProvider.composeQueryString");
        }
    }

    composeBody(params, subRequestIndex = 0) {
        try {
            const hex = params[0];
            return `${hex}`;
        } catch (e) {
            improveAndRethrow(e, "BlockstreamPostTransactionApiProvider.composeBody");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            return response.data;
        } catch (e) {
            improveAndRethrow(e, "BlockstreamPostTransactionApiProvider.getDataByResponse");
        }
    }
}

class BlockchairPostTransactionApiProvider extends ExternalApiProvider {
    constructor() {
        super("https://api.blockchair.com/", "post", 20000, ApiGroups.BLOCKCHAIR);
    }

    composeQueryString(params, subRequestIndex = 0) {
        try {
            const network = params[1];
            let prefix = "bitcoin";
            if (network === Coins.COINS.BTC.testnet) {
                prefix = "bitcoin/testnet";
            }
            return `${prefix}/push/transaction`;
        } catch (e) {
            improveAndRethrow(e, "BlockchairPostTransactionApiProvider.composeQueryString");
        }
    }

    composeBody(params, subRequestIndex = 0) {
        try {
            const hex = params[0];
            return `data=${hex}`;
        } catch (e) {
            improveAndRethrow(e, "BlockchairPostTransactionApiProvider.composeBody");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            const data = response?.data?.data;
            return data?.transaction_hash ?? null;
        } catch (e) {
            improveAndRethrow(e, "BlockchairPostTransactionApiProvider.getDataByResponse");
        }
    }
}

class BitcorePostTransactionApiProvider extends ExternalApiProvider {
    constructor() {
        super("https://api.bitcore.io/api/BTC/", "post", 20000, ApiGroups.BITCORE);
    }
    composeQueryString(params, subRequestIndex = 0) {
        try {
            const network = params[1];
            const networkPath = network.key === Coins.COINS.BTC.testnet.key ? "testnet/" : "mainnet/";
            return `${networkPath}tx/send`;
        } catch (e) {
            improveAndRethrow(e, "BitcorePostTransactionApiProvider.composeQueryString");
        }
    }

    composeBody(params, subRequestIndex = 0) {
        try {
            const hex = params[0];
            return `${hex}`;
        } catch (e) {
            improveAndRethrow(e, "BitcorePostTransactionApiProvider.composeBody");
        }
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        try {
            return response.data;
        } catch (e) {
            improveAndRethrow(e, "BitcorePostTransactionApiProvider.getDataByResponse");
        }
    }
}

export class BtcTransactionPushingProvider {
    static _provider = new RobustExternalAPICallerService("btcTransactionPushingProvider", [
        new BlockstreamPostTransactionApiProvider(),
        new BlockchairPostTransactionApiProvider(),
        new BitcorePostTransactionApiProvider(),
    ]);

    static async pushRawHexBtcTransaction(hexTransaction, network) {
        try {
            return await this._provider.callExternalAPI([hexTransaction, network], 30000, null, 1);
        } catch (e) {
            improveAndRethrow(e, "pushRawHexBtcTransaction");
        }
    }
}
