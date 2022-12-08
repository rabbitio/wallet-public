export const MONGODB_MAX_RECONNECT_ATTEMPTS_COUNT = 10; // Max number of attempts to connect to Mongo DB
export const MONGODB_RECONNECT_INTERVAL = 1000; // msec
export const MONGODB_CONNECTIONS_POOL_SIZE = 20;
export const MONGODB_RECONNECTION_INTERVAL_FACTOR = 1.5;
export const MONGODB_MAX_RECONNECTION_INTERVAL = 100000; // 100sec
export const DB_NAME = "wallet";
export const PORTS = [43127, 43128, 43129];
export const REPLICA_SET_NAME = "local-mongo-rs";
// export const MONGODB_URL = "mongodb://127.0.0.1:43127,127.0.0.1:43128,127.0.0.1:43129/wallet?replicaSet=local-mongo-rs"; // For the im-memory local DB
export const MONGODB_URL =
    "mongodb+srv://application_backend_local:FX3Rr7YR9V-f-7-VYB3@wallet.ltys2.mongodb.net/wallet?replicaSet=wallet&retryWrites=true&w=majority"; // Free Atlas replica set for only local/dev use
export const SESSION_EXPIRATION_TIME = 3 * 60 * 60 * 1000; // 3h in ms
export const PASSWORD_SALT = "cbc9c81e-db75-4c6f-9769-78e7238b01d4";
export const SERVER_PORT = 3002;
export const MAX_FAILED_LOGIN_ATTEMPTS_COUNT = 5;
export const LOGIN_LOCK_PERIOD_MS = 30 * 1000; // ms, 30 sec
export const NUMBER_OF_DATES_TO_CHECK_RATES_FOR = 30;
export const NOTIFICATIONS_API_TOKEN_HASH =
    /* 9958ba11-177b-418c-9de4-bf543439f5cb */ "4b1a9487c102014dfaf1d7ed18792d22c40289eabf5df01de6f121e101d654c4d28b0e8a6f3ccc66e70b51dc22a1270067963410a2475554fc0eb5eae96d727a";
export const SUPPORT_EMAIL = "support@rabbit.io";
export const SUPPORT_EMAIL_PASSWORD = "gmd4na8Rka5aOxWJTJLj3Q"; // Set this password for when you run new instance of the Proton Mail Bridge
export const EMAIL_BRIDGE_PORT = 2025;
export const EMAIL_BRIDGE_HOST = "127.0.0.1";
export const RAMP_PUBLIC_KEY =
    "-----BEGIN PUBLIC KEY-----\n" +
    "MFYwEAYHKoZIzj0CAQYFK4EEAAoDQgAEevN2PMEeIaaMkS4VIfXOqsLebj19kVeu\n" +
    "wWl0AnkIA6DJU0r3ixkXVhJTltycJtkDoEAYtPHfARyTofB5ZNw9xA==\n" +
    "-----END PUBLIC KEY-----";
export const MAX_CLIENT_LOGS_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
