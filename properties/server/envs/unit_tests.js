export const MONGODB_MAX_RECONNECT_ATTEMPTS_COUNT = 10; // Max number of attempts to connect to Mongo DB
export const MONGODB_RECONNECT_INTERVAL = 1000; // msec
export const MONGODB_CONNECTIONS_POOL_SIZE = 20;
export const MONGODB_RECONNECTION_INTERVAL_FACTOR = 1.5;
export const MONGODB_MAX_RECONNECTION_INTERVAL = 100000; // 100sec
export const DB_NAME = "wallet";
export const DB_PORT = 42947;
export const MONGODB_URL = "";
export const SESSION_EXPIRATION_TIME = 3 * 60 * 60 * 1000; // 3h in ms
export const PASSWORD_SALT = "cbc9c81e-db75-4c6f-9769-78e7238b01d4";
export const SERVER_PORT = 3337;
export const MAX_FAILED_LOGIN_ATTEMPTS_COUNT = 5;
export const LOGIN_LOCK_PERIOD_MS = 15 * 60 * 1000; // ms, 15 min
export const NUMBER_OF_DATES_TO_CHECK_RATES_FOR = 30;
export const NOTIFICATIONS_API_TOKEN_HASH =
    /* 8f2b632d-27e4-4674-91c9-df146962eac1 */ "ea97922d4f03c6b0fba8030e45981f9d86336b6a60bd88d52fac8d1114644cccb978e466c732aa0b59b2f2fe825f88522728b8ac4f974bfc6222946b0ff01d63";
export const SUPPORT_EMAIL = "support@rabbit.io";
export const SUPPORT_EMAIL_PASSWORD = "YTV86KTJaU4WfGtIaeptuQ"; // Set this password for when you run new instance of the Proton Mail Bridge
export const EMAIL_BRIDGE_PORT = 2025;
export const EMAIL_BRIDGE_HOST = "127.0.0.1";
export const RAMP_PUBLIC_KEY =
    "-----BEGIN PUBLIC KEY-----\n" +
    "MFYwEAYHKoZIzj0CAQYFK4EEAAoDQgAEevN2PMEeIaaMkS4VIfXOqsLebj19kVeu\n" +
    "wWl0AnkIA6DJU0r3ixkXVhJTltycJtkDoEAYtPHfARyTofB5ZNw9xA==\n" +
    "-----END PUBLIC KEY-----";
export const MAX_CLIENT_LOGS_LIFETIME_MS = 60 * 60 * 1000;
