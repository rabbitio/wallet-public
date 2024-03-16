import { Logger } from "@rabbitio/ui-kit";

import { EventBus, NEW_BLOCK_EVENT, NEW_BLOCK_DEDUPLICATED_EVENT } from "../../../../common/adapters/eventbus.js";
import { ExternalBlocksApiCaller } from "../../external-apis/blocksAPI.js";
import { Storage } from "../../../../common/services/internal/storage.js";

/**
 * Manages last block in the network - listens for it and uses long-polling just to ensure block
 * number retrieval in case of listener issues. Emits "deduplicated" event if retrieved block height is greater
 * than the local one.
 */
class CurrentBlockService {
    constructor() {
        this._currentBlockNumber = 0;
        this._interval = null;
        EventBus.addEventListener(NEW_BLOCK_EVENT, (event, data) => {
            const newBlockNumber = data?.x?.height;
            this._processNewBlockNumber(newBlockNumber);
        });
    }

    async initialize() {
        const loggerSource = "initialize";
        try {
            this._currentBlockNumber = await ExternalBlocksApiCaller.retrieveCurrentBlockNumber(
                Storage.getCurrentNetwork()
            );

            Logger.log(`Current block data initialized: ${this._currentBlockNumber}`, loggerSource);

            this._interval = setInterval(async () => {
                try {
                    const block = await ExternalBlocksApiCaller.retrieveCurrentBlockNumber(Storage.getCurrentNetwork());
                    this._processNewBlockNumber(block);
                } catch (e) {
                    Logger.logError(e, "blocks_lookup", "Failed to get block number in the listener");
                }
            }, 120000);
        } catch (e) {
            Logger.logError(e, loggerSource, "Failed to initialize current block number");
        }
    }

    getCurrentBlockHeight() {
        return this._currentBlockNumber;
    }

    _processNewBlockNumber(newBlockNumber) {
        if (newBlockNumber && newBlockNumber > this._currentBlockNumber) {
            this._currentBlockNumber = newBlockNumber;
            EventBus.dispatch(NEW_BLOCK_DEDUPLICATED_EVENT, null, newBlockNumber);
        }
    }
}

export const currentBlockService = new CurrentBlockService();
