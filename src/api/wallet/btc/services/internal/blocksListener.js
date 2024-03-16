import { Logger } from "@rabbitio/ui-kit";

import { EventBus, NEW_BLOCK_EVENT } from "../../../../common/adapters/eventbus.js";
import { Storage } from "../../../../common/services/internal/storage.js";
import { Coins } from "../../../coins.js";

// TODO: [feature, moderate] Add more providers
class BlocksListener {
    constructor() {
        this._socket = null;
        this._URL = "wss://ws.blockchain.info/inv";
    }

    setupListeningForNewBlocks() {
        const loggerSource = "setupListeningForNewBlocks";

        this._socket = new WebSocket(this._URL);

        this._socket.onopen = () => {
            try {
                this._socket.send('{"op":"blocks_sub"}');
                Logger.log(`On open websoket performed`, loggerSource);
            } catch (e) {
                Logger.logError(e, loggerSource, "Failed to open blocks socket");
            }
        };

        this._socket.onmessage = message => {
            try {
                const data = JSON.parse(message.data);
                if (Storage.getCurrentNetwork() === Coins.COINS.BTC.mainnet) {
                    EventBus.dispatch(NEW_BLOCK_EVENT, null, data);
                }

                Logger.log(`On message websoket performed. Block ${data?.x?.height}`, loggerSource);
            } catch (e) {
                Logger.logError(e, loggerSource, "Failed to handle message from blocks socket");
            }
        };

        this._socket.onclose = () => {
            try {
                this.setupListeningForNewBlocks();
                Logger.log("On socket close - setup of listening was done", loggerSource);
            } catch (e) {
                Logger.logError(e, loggerSource, "Failed to handle block socket closing");
            }
        };

        this._socket.onerror = error => {
            try {
                Logger.logError(error, "Websocket has failed");
            } catch (e) {
                Logger.logError(e, loggerSource, "Failed to handle socket error");
            }
        };
    }
}

export const blocksListener = new BlocksListener();
