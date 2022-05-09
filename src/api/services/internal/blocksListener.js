import { EventBus, NEW_BLOCK_EVENT } from "../../adapters/eventbus";
import { logError } from "../../utils/errorUtils";
import { Logger } from "./logs/logger";
import { getCurrentNetwork } from "./storage";
import { mainnet } from "../../lib/networks";

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
                logError(e, loggerSource, "Failed to open blocks socket");
            }
        };

        this._socket.onmessage = message => {
            try {
                const data = JSON.parse(message.data);
                if (getCurrentNetwork() === mainnet.key) {
                    EventBus.dispatch(NEW_BLOCK_EVENT, null, data);
                }

                Logger.log(`On message websoket performed. Block ${data?.x?.height}`, loggerSource);
            } catch (e) {
                logError(e, loggerSource, "Failed to handle message from blocks socket");
            }
        };

        this._socket.onclose = () => {
            try {
                this.setupListeningForNewBlocks();
                Logger.log("On socket close - setup of listening was done", loggerSource);
            } catch (e) {
                logError(e, loggerSource, "Failed to handle block socket closing");
            }
        };

        this._socket.onerror = error => {
            try {
                logError(error, "Websocket has failed");
            } catch (e) {
                logError(e, loggerSource, "Failed to handle socket error");
            }
        };
    }
}

export const blocksListener = new BlocksListener();
