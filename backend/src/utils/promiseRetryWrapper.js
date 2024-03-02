import promiseRetry from "promise-retry";

export class PromiseRetryWrapper {
    /**
     * Just wraps original promiseRetry to allow mocking for unit testing
     */
    static promiseRetryWrapped(callback, options)  {
        return promiseRetry(callback, options);
    }
}
