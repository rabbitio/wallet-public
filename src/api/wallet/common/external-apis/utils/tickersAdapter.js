export const standardTickerToRabbitTicker = function(ticker, protocol) {
    return `${ticker}${protocol ?? ""}`.toUpperCase();
};

/**
 * @param ticker {string}
 * @param protocol {Protocol}
 * @return {string}
 */
export const rabbitTickerToStandardTicker = function(ticker, protocol) {
    if (protocol) return ticker.split(protocol.protocol)[0];
    return ticker;
};
