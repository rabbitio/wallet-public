export const MONGODB_MAX_RECONNECT_ATTEMPTS_COUNT = 10; // Max number of attempts to connect to Mongo DB
export const MONGODB_RECONNECT_INTERVAL = 1000; // msec
export const MONGODB_CONNECTIONS_POOL_SIZE = 20;
export const MONGODB_RECONNECTION_INTERVAL_FACTOR = 1.5;
export const MONGODB_MAX_RECONNECTION_INTERVAL = 100000; // 100sec
export const DB_NAME = "will be filled at CI/CD from secure env variable";
export const MONGODB_URL = "will be filled at CI/CD from secure env variable";
export const SESSION_EXPIRATION_TIME = 3 * 60 * 60 * 1000; // 3h in ms
export const PASSWORD_SALT = "will be filled at CI/CD from secure env variable";
export const SERVER_PORT = 3002;
export const MAX_FAILED_LOGIN_ATTEMPTS_COUNT = 5;
export const LOGIN_LOCK_PERIOD_MS = 15 * 60 * 1000; // ms, 15 min
export const NUMBER_OF_DATES_TO_CHECK_RATES_FOR = 30;
export const NOTIFICATIONS_API_TOKEN_HASH = "will be filled at CI/CD from secure env variable";
export const SUPPORT_EMAIL = "will be filled at CI/CD from secure env variable";
export const SUPPORT_EMAIL_PASSWORD = "will be filled at CI/CD from secure env variable";
export const EMAIL_BRIDGE_PORT = "will be filled at CI/CD from secure env variable";
export const EMAIL_BRIDGE_HOST = "will be filled at CI/CD from secure env variable";
export const RAMP_PUBLIC_KEY =
    "-----BEGIN PUBLIC KEY-----\n" +
    "MFYwEAYHKoZIzj0CAQYFK4EEAAoDQgAElvxpYOhgdAmI+7oL4mABRAfM5CwLkCbZ\n" +
    "m64ERVKAisSulWFC3oRZom/PeyE2iXPX1ekp9UD1r+51c9TiuIHU4w==\n" +
    "-----END PUBLIC KEY-----";
