export class ExternalApiProvider {
    /**
     * Creates an instance of external api provider.
     *
     * If you need sub-request then use 'subRequestIndex' to check current request index in functions below.
     * Also use array for 'httpMethod'.
     *
     * If the endpoint of dedicated provider has pagination then you should customize the behavior using
     * "changeQueryParametersForPageNumber", "checkWhetherResponseIsForLastPage".
     *
     * We perform RPS counting all over the App to avoid blocking our clients due to abuses of the providers.
     *
     * @param endpoint {string} URL to the provider's endpoint. Note: you can customize it using composeQueryString
     * @param [httpMethod] {string|string[]} one of "get", "post", "put", "patch", "delete" or an array of these values
     *        for request having sub-requests
     * @param [timeout] {number} number of milliseconds to wait for the response
     * @param [apiGroup] {ApiGroup} singleton object containing parameters of API group. Helpful when you use the same
     *        api for different providers to avoid hardcoding RPS inside each provider what can cause mistakes
     * @param [specificHeaders] {Object} contains specific keys (headers) and values (their content) if needed for this provider
     * @param [maxPageLength] {number} optional number of items per page if the request supports pagination
     */
    constructor(
        endpoint,
        httpMethod,
        timeout,
        apiGroup,
        specificHeaders = {},
        maxPageLength = Number.MAX_SAFE_INTEGER
    ) {
        this.endpoint = endpoint;
        this.httpMethod = httpMethod ?? "get";
        // TODO: [refactoring, critical] We have two timeouts for robust data retrieval - here and inside the service method call, need to remain the only
        this.timeout = timeout ?? 10000;
        // TODO: [refactoring, critical] We need single place for all RPSes as we use them as hardcoded constants now inside different services
        this.apiGroup = apiGroup;
        this.maxPageLength = maxPageLength ?? Number.MAX_SAFE_INTEGER;
        this.niceFactor = 1;
        this.specificHeaders = specificHeaders ?? {};
    }

    getRps() {
        return this.apiGroup.rps ?? 2;
    }

    isRpsExceeded() {
        return this.apiGroup.isRpsExceeded();
    }

    actualizeLastCalledTimestamp() {
        this.apiGroup.actualizeLastCalledTimestamp();
    }

    getApiGroupId() {
        return this.apiGroup.id;
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
     * @param iterationsData {any[]} array of data retrieved from previous sub-requests
     * @returns {any}
     */
    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        return [];
    }

    /**
     * Function changing the query string according to page number and previous response
     * Only for endpoints supporting pagination
     *
     * @param params {any[]} params array passed to the RobustExternalAPICallerService
     * @param previousResponse {Object} HTTP response returned by provider for previous call (previous page)
     * @param pageNumber {number} new page number. We count from 0. You need to manually increment with 1 if your
     *        provider counts pages starting with 1
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
     * Resets the nice factor to default value
     */
    resetNiceFactor() {
        this.niceFactor = 1;
    }

    /**
     * Internal method used for requests requiring sub-requests.
     *
     * @param iterationsData {any[]} iterations data retrieved from getDataByResponse called per sub-request.
     * @return {any} by default flatten the passed iterations data array. Should be redefined if you need another logic.
     */
    incorporateIterationsData(iterationsData) {
        return iterationsData.flat();
    }
}
