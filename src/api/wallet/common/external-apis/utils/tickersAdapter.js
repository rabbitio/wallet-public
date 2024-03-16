export class TickersAdapter {
    /**
     * @param ticker {string}
     * @param protocol {string}
     * @return {string}
     *
     * TODO: [refactoring, critical] use single way - currently one function accepts Protocol and another string (Protocol.protocol) task_id=5b04a1b9470e4fd2813e949f597a9d08
     */
    static standardTickerToRabbitTicker = function (ticker, protocol) {
        return `${ticker}${protocol || ""}`.toUpperCase();
    };

    /**
     * @param ticker {string}
     * @param protocol {Protocol}
     * @return {string}
     */
    static rabbitTickerToStandardTicker = function (ticker, protocol) {
        if (protocol && protocol.protocol) return ticker.split(protocol.protocol)[0];
        return ticker;
    };

    static filterRabbitTicker(ticker) {
        return /^[0-9a-zA-Z]+$/.test(ticker) ? ticker : false;
    }
}
