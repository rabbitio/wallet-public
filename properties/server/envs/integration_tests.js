export const MONGODB_MAX_RECONNECT_ATTEMPTS_COUNT = 10; // Max number of attempts to connect to Mongo DB
export const MONGODB_RECONNECT_INTERVAL = 1000; // msec
export const MONGODB_CONNECTIONS_POOL_SIZE = 20;
export const MONGODB_RECONNECTION_INTERVAL_FACTOR = 1.5;
export const MONGODB_MAX_RECONNECTION_INTERVAL = 100000; // 100sec
export const DB_NAME = "wallet";
export const PORTS = [42927, 42928, 42929];
export const REPLICA_SET_NAME = "serverIntegrationReplicaSet";
export const MONGODB_URL = `mongodb://127.0.0.1:${PORTS[0]},127.0.0.1:${PORTS[1]},127.0.0.1:${PORTS[2]}/${DB_NAME}?replicaSet=${REPLICA_SET_NAME}`;
export const SESSION_EXPIRATION_TIME = 3 * 60 * 60 * 1000; // 3h in ms
export const PASSWORD_SALT = "cbc9c81e-db75-4c6f-9769-78e7238b01d4";
export const SERVER_PORT = 3337;
export const MAX_FAILED_LOGIN_ATTEMPTS_COUNT = 5;
export const LOGIN_LOCK_PERIOD_MS = 15 * 60 * 1000; // ms, 15 min
export const NUMBER_OF_DATES_TO_CHECK_RATES_FOR = 30;
export const NOTIFICATIONS_API_TOKEN_HASH =
    /* 8ff0bbdd-0105-4f72-ad49-f1e8c86f7ab7 */ "ba1a185d5900e57cca2eac65b5f2789f0152e51f5f9c2f0d6955a4bd66766ffca4c56245a947b1473a9fdae6135061d11fe5486abd6fad916eeadacc7d6aaf46";
export const SUPPORT_EMAIL = "support@rabbit.io";
export const SUPPORT_EMAIL_PASSWORD = "YTV86KTJaU4WfGtIaeptuQ"; // Set this password for when you run new instance of the Proton Mail Bridge
export const EMAIL_BRIDGE_PORT = 2025;
export const EMAIL_BRIDGE_HOST = "127.0.0.1";
