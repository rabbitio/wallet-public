import promiseRetry from "promise-retry";

/**
 * Just wraps original promiseRetry to allow mocking for unit testing
 */
export function promiseRetryWrapped(callback, options)  {
    return promiseRetry(callback, options);
}
