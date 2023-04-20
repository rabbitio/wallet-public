import { EventBus, LOGGED_OUT_EVENT, NO_AUTHENTICATION_EVENT, WALLET_DELETED_EVENT } from "../adapters/eventbus";
import { improveAndRethrow, logError } from "./errorUtils";
import { IS_TESTING } from "../../../properties";
import { getPersistentCacheItem, setPersistentCacheItem } from "../services/internal/storage";

/**
 * TODO: [tests, critical] Ued by payments logic
 *
 * Simple cache based on Map.
 * Provides ability to store session-dependent data.
 */
class Cache {
    constructor() {
        this._cache = new Map();
        this._eventDependentDataKeys = [];

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

    /**
     * Puts data to cache
     *
     * @param key {string} string key for this data
     * @param data {any} any data
     * @param ttlMs {number|null} optional milliseconds number for cache lifetime
     * @throws {Error} when the data is null/undefined because these values for data are reserved for internal logic
     */
    put(key, data, ttlMs = null) {
        try {
            if (typeof key !== "string" || data == null) {
                throw new Error(`Trying to cache corrupted data: ${key}, ${data}`);
            }
            this._cache.set(key, { data: data, addedMsTimestamp: Date.now(), ttlMs: ttlMs });
        } catch (e) {
            improveAndRethrow(e, "cache.put");
        }
    }

    putSessionDependentData(key, data, ttlMs = null) {
        this._putEventDependentData(
            key,
            data,
            [NO_AUTHENTICATION_EVENT, LOGGED_OUT_EVENT, WALLET_DELETED_EVENT],
            ttlMs
        );
    }

    /**
     * Puts data to cache and adds its key to list of keys that should be related by each of given events.
     *
     * @param key {string} key for cache
     * @param data {any} any caching data
     * @param events {string[]} list of events forcing putting data to be removed when triggered
     * @param ttlMs {|null} optional time to live for this cache item
     * @throws {Error} when the data is null/undefined because these values for data are reserved for internal logic
     */
    putEventDependentData(key, data, events, ttlMs = null) {
        this._putEventDependentData(key, data, events, ttlMs);
    }

    _putEventDependentData(key, data, events, ttlMs = null) {
        try {
            if (typeof key !== "string" || data == null) {
                throw new Error(`Trying to cache corrupted data: ${key}, ${data}`);
            }
            this._cache.set(key, { data: data, addedMsTimestamp: Date.now(), ttlMs: ttlMs });
            for (let event of events) {
                const eventAndKeys = this._eventDependentDataKeys.find(item => item[0] === event);
                if (eventAndKeys) {
                    eventAndKeys.push(key);
                } else {
                    this._eventDependentDataKeys.push([event, key]);
                    EventBus.addEventListener(event, () => {
                        try {
                            const keys = this._eventDependentDataKeys.find(item => item[0] === event);
                            (keys ?? [event]).slice(1).forEach(key => this._cache.delete(key));
                        } catch (e) {
                            logError(e, "cache.removing-for-event", `Event: ${event}`);
                        }
                    });
                }
            }
        } catch (e) {
            improveAndRethrow(e, "putEventDependentData");
        }
    }

    // TODO: [feature, low] add clearing of expired data by schedule
    get(key) {
        try {
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
        } catch (e) {
            improveAndRethrow(e, "cache.get");
        }
    }

    getLastUpdateTimestamp(key) {
        return this._cache.get(key)?.addedMsTimestamp ?? null;
    }

    invalidate(key) {
        try {
            this._cache.delete(key);
        } catch (e) {
            improveAndRethrow(e, "invalidate");
        }
    }

    invalidateContaining(keyPart) {
        if (typeof keyPart !== "string" || keyPart === "") {
            throw new Error("Trying to invalidate containing wrong key or empty key: " + keyPart);
        }

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

    /**
     * Saves given data string to persistent cache.
     * NOTE: we have no TTL here, implement if needed.
     *
     * WARNING: use only when really needed and don't store big data as we use localStorage
     * under the hood and its capacity is restricted.
     *
     * @param uniqueKey {string} the key should be unique
     * @param data {string} only string data allowed
     */
    putClientPersistentData(uniqueKey, data) {
        try {
            setPersistentCacheItem(uniqueKey, data);
        } catch (e) {
            improveAndRethrow(e, "putClientPersistentData");
        }
    }

    /**
     * @param uniqueKey {string}
     * @return {string}
     */
    getClientPersistentData(uniqueKey) {
        try {
            return getPersistentCacheItem(uniqueKey);
        } catch (e) {
            improveAndRethrow(e, "getClientPersistentData");
        }
    }
}

export const cache = new Cache();
