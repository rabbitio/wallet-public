import { getLogger } from "log4js";

import {
    DB_NAME,
    MONGODB_CONNECTIONS_POOL_SIZE,
    MONGODB_MAX_RECONNECT_ATTEMPTS_COUNT,
    MONGODB_MAX_RECONNECTION_INTERVAL,
    MONGODB_RECONNECT_INTERVAL,
    MONGODB_RECONNECTION_INTERVAL_FACTOR,
    MONGODB_URL,
} from "../properties";
import { isPingResultOk } from "../services/mongoUtil";
import { improveAndRethrow } from "./utils";
import { promiseRetryWrapped } from "./promiseRetryWrapper";
import { connectWrapper } from "./connectWrapper";

class DbConnectionHolder {
    constructor() {
        this._log = getLogger("DbConnectionHolder");
        this._isReconnecting = false;
        this._db = null;
        this._client = null;
    }

    async connectToDb() {
        try {
            await this._robustlyConnectToMongodb();
        } catch (e) {
            this._log.error("Error has occurred during the connection to DB server. ", e);
        }
    }

    async _robustlyConnectToMongodb() {
        this._log.debug("Start connecting to mongodb.");

        if (this._isReconnecting) {
            this._log.debug("Reconnection is in progress. Throwing error to stop origin action.");
            throw new DbNotAccessibleError();
        }

        try {
            this._isReconnecting = true; // No race conditions due to uninterruptable functions execution in JS (until await)

            const promiseRetryOptions = {
                retries: MONGODB_MAX_RECONNECT_ATTEMPTS_COUNT,
                factor: MONGODB_RECONNECTION_INTERVAL_FACTOR,
                minTimeout: MONGODB_RECONNECT_INTERVAL,
                maxTimeout: MONGODB_MAX_RECONNECTION_INTERVAL,
            };

            const client = await promiseRetryWrapped(this._connectingCallback.bind(this), promiseRetryOptions);

            this._client = client;
            this._db = client.db(DB_NAME);

            this._log.debug("Successfully connected to mongodb and retrieved db. ");
        } catch (e) {
            this._log.error("promiseRetry has failed to reconnect to mongodb. setting _db and _client to null. ", e);
            this._client = null;
            this._db = null;
            throw new DbNotAccessibleError();
        } finally {
            this._isReconnecting = false;
        }
    }

    _connectingCallback(retry, number) {
        this._log.info(`Connecting to mongodb - attempt number: ${number}.`);

        const mongodbConnectionOptions = {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            poolSize: MONGODB_CONNECTIONS_POOL_SIZE,
            // bufferMaxEntries: 0 // To abort requests immediately in case of lost connection to avoid waiting during the whole reconnection process
        };

        return connectWrapper(MONGODB_URL, mongodbConnectionOptions).catch(err => {
            this._log.error("Failed to connect to MongoDB. ", err);
            retry(err);
        });
    }

    // TODO: [tests, critical] Write integration test to check it works actually as it is pretty difficult to do this manually
    reconnectToDbIfNeeded() {
        (async () => {
            try {
                if (this._isReconnecting) {
                    return;
                }

                if (!this._isDbInitialized() || !isPingResultOk(await this._db.admin().ping())) {
                    this._log.info("Start attempt to fix db error as db is not initialized or ping failed.");

                    await this._robustlyConnectToMongodb();

                    this._log.info("Reconnect has been initiated. End. ");
                } else {
                    this._log.info("Pinged successfully, no reconnect required. End. ");
                }
            } catch (e) {
                this._log.error("Failed to ping or reconnect. ", e);
            }
        })();
    }

    _isDbInitialized() {
        return !(this._db == null || this._client == null);
    }

    async getCollection(collectionName) {
        try {
            this._log.trace("Start getting a collection.");

            await this._reconnectIfNeeded();

            if (!this._isDbInitialized() || this._isReconnecting) {
                throw new DbNotAccessibleError();
            }

            this._log.trace("Db is initialized, retrieving and returning a collection. ");
            return this._db.collection(collectionName);
        } catch (e) {
            improveAndRethrow(e, "getCollection");
        }
    }

    async getClient() {
        try {
            this._log.trace("Start getting client.");

            await this._reconnectIfNeeded();

            if (!this._isDbInitialized() || this._isReconnecting) {
                throw new DbNotAccessibleError();
            }

            this._log.trace("Db is initialized and not reconnecting so returning the client. ");
            return this._client;
        } catch (e) {
            improveAndRethrow(e, "getClient");
        }
    }

    async _reconnectIfNeeded() {
        try {
            this._log.trace("Start reconnecting if needed.");
            if (!this._isDbInitialized() && !this._isReconnecting) {
                try {
                    this._log.info("mongodb is not initialized, trying to reconnect. ");
                    await this._robustlyConnectToMongodb();
                    this._log.info("Successfully reconnected to mongodb. End.");
                } catch (e) {
                    this._log.error("Failed to initiate reconnect to mongodb. End.", e);
                }
            } else {
                this._log.trace("Reconnection is not needed.");
            }
        } catch (e) {
            this._log.error("Failed to check reconnection need or initiate a reconnect. ");
        }
    }
}

export const dbConnectionHolder = new DbConnectionHolder();

export function connectToDbWrapped(callback) {
    (async () => {
        await dbConnectionHolder.connectToDb();
        await callback();
    })();
}

export class DbNotAccessibleError {
    constructor() {
        this.message = "DB is not accessible right now, try again.";
        this.stack = new Error().stack;
    }
}
