export const MONGODB_MAX_RECONNECT_ATTEMPTS_COUNT = 10; // Max number of attempts to connect to Mongo DB
export const MONGODB_RECONNECT_INTERVAL = 1000; // msec
export const MONGODB_CONNECTIONS_POOL_SIZE = 20;
export const MONGODB_RECONNECTION_INTERVAL_FACTOR = 1.5;
export const MONGODB_MAX_RECONNECTION_INTERVAL = 100000; // 100sec
export const DB_NAME = "wallet";
export const MONGODB_URL =
    "mongodb://server_app_user:7h142gHDygdGz-iCwCven@172.18.0.12:27017,172.18.0.12:27018,172.18.0.12:27019/wallet?authMechanism=SCRAM-SHA-256&replicaSet=localReplicaSet";
export const SESSION_EXPIRATION_TIME = 3 * 60 * 60 * 1000; // 3h in ms
export const PASSWORD_SALT = "cbc9c81e-db75-4c6f-9769-78e7238b01d4";
export const SERVER_PORT = 3002;
export const MAX_FAILED_LOGIN_ATTEMPTS_COUNT = 5;
export const LOGIN_LOCK_PERIOD_MS = 30 * 1000; // ms, 30 sec
export const NUMBER_OF_DATES_TO_CHECK_RATES_FOR = 30;
export const NOTIFICATIONS_API_TOKEN_HASH =
    /* a1252331-014a-49bc-ad32-cf95a2d0a78c */ "43e52b519d4cff02809961128222fd57da254f709ba4f7de3103327c0ed6f0dd55e2941135f25e5672e3daa476f7534e276c8ff50b86980faad66585bd02fc31";
export const SUPPORT_EMAIL = "support@rabbit.io";
export const SUPPORT_EMAIL_PASSWORD = "YTV86KTJaU4WfGtIaeptuQ"; // Set this password for when you run new instance of the Proton Mail Bridge
export const EMAIL_BRIDGE_PORT = 2025;
export const EMAIL_BRIDGE_HOST = "127.0.0.1";
