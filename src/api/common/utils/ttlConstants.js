/**
 * This constant should be used as the TTL for most of the transaction/balance retrievals for different blockchains.
 * If your case is specific (like the data source has some not ordinary limitations) use custom hardcoded TTL
 * or just add a new constant here.
 *
 * @type {number}
 */
export const STANDARD_TTL_FOR_TRANSACTIONS_OR_BALANCES_MS = 120_000;

/**
 * This TTL constant is useful for data that is being updated relatively frequently
 * @type {number}
 */
export const MODERATE_TTL_FOR_RELATIVELY_FREQ_CHANGING_DATA_MS = 300_000;

/**
 * This TTL constant is useful when the data is being changed frequently, but the data source has strict requests limit
 * @type {number}
 */
export const LONG_TTL_FOR_FREQ_CHANGING_DATA_MS = 600_000;

/**
 * This TTL constant is useful when the data either permanent or changing seldom
 * @type {number}
 */
export const PERMANENT_TTL_FOR_RARE_CHANGING_DATA_MS = 600_000_000;

/**
 * This TTL constant is useful for frequently changing data like fee rates and other payment-related data
 * @type {number}
 */
export const SMALL_TTL_FOR_FREQ_CHANGING_DATA_MS = 30_000;

/**
 * This TTL constant is useful for really rarely changing data like tron network constants
 * @type {number}
 */
export const LONG_TTL_FOR_REALLY_RARELY_CHANGING_DATA_MS = 12 /* hours */ * 60 * 60 * 1000;

/**
 * This TTL constant is useful for Level-2 caches (cache over the cached data - like transactions history service)
 * @type {number}
 */
export const SMALL_TTL_FOR_CACHE_L2_MS = 50_000;
