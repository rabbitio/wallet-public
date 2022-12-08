import { EventBus, LOGGED_OUT_EVENT, NO_AUTHENTICATION_EVENT, WALLET_DELETED_EVENT } from "../adapters/eventbus";
import { improveAndRethrow } from "./errorUtils";
import { IS_TESTING } from "../../../properties";

/**
 * TODO: [tests, critical] Ued by payments logic
 *
 * Simple cache based on Map.
 * Provides ability to store session-dependent data.
 */
class Cache {
    constructor() {
        this._cache = new Map();
        this._sessionDependentDataKeys = [];

        [NO_AUTHENTICATION_EVENT, LOGGED_OUT_EVENT, WALLET_DELETED_EVENT].forEach(event =>
            EventBus.addEventListener(event, () => {
                this._sessionDependentDataKeys.forEach(key => this._cache.delete(key));
            })
        );

        !IS_TESTING && this._setupIntervalClearingExpired();
    }

    _setupIntervalClearingExpired() {
        let cleaner = function() {
            try {
                for (const key of this._cache.keys()) {
                    const item = this._cache.get(key);
                    if (item && item.ttlMs && item.addedMsTimestamp + item.ttlMs < Date.now()) {
                        this._cache.delete(key);
                    }
                }
            } catch (e) {
                improveAndRethrow(e, "_intervalClearingExpiredCache");
            }
        };

        cleaner = cleaner.bind(this);

        setInterval(cleaner, 1000);
    }

    put(key, data, ttlMs = null) {
        this._cache.set(key, { data: data, addedMsTimestamp: Date.now(), ttlMs: ttlMs });
    }

    putSessionDependentData(key, data, ttlMs = null) {
        this._cache.set(key, { data: data, addedMsTimestamp: Date.now(), ttlMs: ttlMs });
        this._sessionDependentDataKeys.push(key);
    }

    // TODO: [dev] add clearing of expired data by schedule
    get(key) {
        const item = this._cache.get(key);
        if (item) {
            if (item.addedMsTimestamp && item.ttlMs !== null && item.addedMsTimestamp + item.ttlMs < Date.now()) {
                this._cache.delete(key);
                return null;
            } else {
                return item.data;
            }
        }

        return null;
    }

    invalidate(key) {
        try {
            this._cache.delete(key);
        } catch (e) {
            improveAndRethrow(e, "invalidate");
        }
    }

    invalidateContaining(keyPart) {
        try {
            const matchedKeys = Array.from(this._cache.keys()).filter(
                key => typeof key === "string" && new RegExp(keyPart).test(key)
            );
            for (let i = 0; i < matchedKeys.length; ++i) {
                this._cache.delete(matchedKeys[i]);
            }
        } catch (e) {
            improveAndRethrow(e, "invalidateContaining");
        }
    }

    clear() {
        this._cache.clear();
        this._sessionDependentDataKeys = [];
    }
}

export const cache = new Cache();
