// TODO: [refactoring, moderate] use it for all providers declared as objects
export class ExternalApiProvider {
    /**
     * Creates an instance of external api provider.
     *
     * @param endpoint {string} URL to the provider's endpoint. Note: you can customise it using composeQueryString
     * @param [httpMethod] {string|string[]} one of "get", "post", "put", "patch", "delete" or an array of these values
     *        for request having sub-requests
     * @param [timeout] {number} number of milliseconds to wait for the response
     * @param [rps] {number} number of requests per second allowed by this provider. Note: the RobustExternalAPICallerService
     *        reduces this value a bit to minimise the risk of API abusing
     * @param [maxPageLength] {number} optional number of items per page if the request supports pagination
     */
    constructor(endpoint, httpMethod, timeout, rps, maxPageLength) {
        this.endpoint = endpoint;
        this.httpMethod = httpMethod ?? "get";
        this.timeout = timeout ?? 10000;
        this.RPS = rps ?? 10;
        this.maxPageLength = maxPageLength ?? Number.MAX_SAFE_INTEGER;
        this.niceFactor = 1;
    }

    /**
     * Some endpoint can require several sub requests. Example is one request to get confirmed transactions
     * and another request for unconfirmed transactions. You should override this method to return true for such requests.
     *
     * @return {boolean} true if this provider requires several requests to retrieve the data
     */
    doesRequireSubRequests() {
        return false;
    }

    /**
     * Some endpoint support pagination. Override this method if so and implement corresponding methods.
     *
     * @return {boolean} true if this provider requires several requests to retrieve the data
     */
    doesSupportPagination() {
        return false;
    }

    /**
     * Composes a query string to be added to the endpoint of this provider.
     *
     * @param params {any[]} params array passed to the RobustExternalAPICallerService
     * @param [subRequestIndex] {number} optional number of the sub-request the call is performed for
     * @returns {string} query string to be concatenated with endpoint
     */
    composeQueryString(params, subRequestIndex = 0) {
        return "";
    }

    /**
     * Composes a body to be added to the request
     *
     * @param params {any[]} params array passed to the RobustExternalAPICallerService
     * @param [subRequestIndex] {number} optional number of the sub-request the call is performed for
     * @returns {string}
     */
    composeBody(params, subRequestIndex = 0) {
        return "";
    }

    /**
     * Extracts data from the response and returns it
     *
     * @param response {Object} HTTP response returned by provider
     * @param [params] {any[]} params array passed to the RobustExternalAPICallerService
     * @param [subRequestIndex] {number} optional number of the sub-request the call is performed for
     * @returns {any}
     */
    getDataByResponse(response, params = [], subRequestIndex = 0) {
        return [];
    }

    /**
     * Function changing the query string according to page number and previous response
     * Only for endpoints supporting pagination
     *
     * @param params {any[]} params array passed to the RobustExternalAPICallerService
     * @param previousResponse {Object} HTTP response returned by provider for previous call (previous page)
     * @param pageNumber {number} new page number
     * @param [subRequestIndex] {number} optional number of the sub-request the call is performed for
     * @returns {any[]}
     */
    changeQueryParametersForPageNumber(params, previousResponse, pageNumber, subRequestIndex = 0) {
        return params;
    }

    /**
     * Function checking whether the response is for the last page to stop requesting for a next page.
     * Only for endpoints supporting pagination.
     *
     * @param previousResponse {Object} HTTP response returned by provider for previous call (previous page)
     * @param currentResponse {Object} HTTP response returned by provider for current call (current page, next after the previous)
     * @param currentPageNumber {number} current page number (for current response)
     * @param [subRequestIndex] {number} optional number of the sub-request the call is performed for
     * @returns {boolean}
     */
    checkWhetherResponseIsForLastPage(previousResponse, currentResponse, currentPageNumber, subRequestIndex = 0) {
        return true;
    }

    /**
     * Resets the nice factor to 1
     */
    resetNiceFactor() {
        this.niceFactor = 1;
    }
}
