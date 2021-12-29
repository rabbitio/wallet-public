export function btcToSatoshi(btcAmount) {
    return Math.round((+btcAmount).toFixed(8) * 100000000);
}

export function satoshiToBtc(satoshiAmount) {
    return +(+satoshiAmount / 100000000).toFixed(8);
}
