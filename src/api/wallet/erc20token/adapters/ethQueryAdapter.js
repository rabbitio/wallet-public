import EthQuery from "eth-query";
import HttpProvider from "ethjs-provider-http";

export class EthQueryAdapter {
    /**
     * Wrapper method to handle EthQuery requests.
     *
     * @param providerUrl {string} URl of provider
     * @param method {string} Method to request
     * @param args {any[]} Arguments to send
     * @returns {Promise<any>} RPC call result
     */
    static query(providerUrl, method, args = []) {
        const ethQuery = new EthQuery(new HttpProvider(providerUrl));

        return new Promise((resolve, reject) => {
            const processResult = (error, result) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(result);
            };

            if (typeof ethQuery[method] === "function") {
                ethQuery[method](...args, processResult);
            } else {
                ethQuery.sendAsync({ method, params: args }, processResult);
            }
        });
    }
}
