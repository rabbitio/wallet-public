import { EventBus, NEW_BLOCK_EVENT } from "../../adapters/eventbus";
import { logError } from "../../utils/errorUtils";

// TODO: [feature, moderate] Add more providers
class BlocksListener {
    constructor() {
        this._socket = null;
        this._URL = "wss://ws.blockchain.info/inv";
    }

    setupListeningForNewBlocks() {
        this._socket = new WebSocket(this._URL);

        this._socket.onopen = () => {
            try {
                this._socket.send('{"op":"blocks_sub"}');
            } catch (e) {
                logError(e, null, "Failed to open blocks socket");
            }
        };

        this._socket.onmessage = message => {
            try {
                const data = JSON.parse(message.data);
                EventBus.dispatch(NEW_BLOCK_EVENT, null, data);
            } catch (e) {
                logError(e, null, "Failed to handle message from blocks socket");
            }
        };

        this._socket.onclose = () => {
            try {
                this.setupListeningForNewBlocks();
            } catch (e) {
                logError(e, null, "Failed to handle block socket closing");
            }
        };

        this._socket.onerror = error => {
            try {
                logError(error, "Websocket has failed");
            } catch (e) {
                logError(e, null, "Failed to handle socket error");
            }
        };
    }
}

export const blocksListener = new BlocksListener();
