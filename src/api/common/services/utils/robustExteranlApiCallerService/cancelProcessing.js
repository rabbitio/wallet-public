import axios from "axios";

/**
 * Utils class needed to perform cancelling of axios request inside some process.
 * Provides cancel state and axios token for HTTP requests
 */
export class CancelProcessing {
    constructor() {
        this._cancelToken = axios.CancelToken.source();
        this._isCanceled = false;
    }

    cancel() {
        this._isCanceled = true;
        this._cancelToken.cancel();
    }

    isCanceled() {
        return this._isCanceled;
    }

    getToken() {
        return this._cancelToken.token;
    }

    static instance() {
        return new CancelProcessing();
    }
}
