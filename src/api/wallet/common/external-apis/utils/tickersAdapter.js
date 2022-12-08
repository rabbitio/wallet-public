import { Coins } from "../../../coins";

export const standardTickerToRabbitTicker = function(ticker) {
    return ticker.toUpperCase() === "USDT" ? Coins.COINS.USDTERC20.ticker : ticker.toUpperCase();
};

export const rabbitTickerToStandardTicker = function(ticker) {
    return ticker === Coins.COINS.USDTERC20.ticker ? "USDT" : ticker;
};
