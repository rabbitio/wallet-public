/**
 * Holds set of external API providers and their RPSes and timestamps of last call.
 * Provides API to actualize last call timestamp.
 * Useful to avoid RPS exceeding when using the same provider several times over the app.
 *
 * Expected to be used as a Singleton
 */

class RPSEnsurer {
    constructor() {
        this._domains = [];
    }

    /**
     * Either adds given domain to internal state and sets last call timestamp to Date.now() or pushes the provider
     * to the map if it is absent.
     *
     * @param domain - domain string
     * @param rps - number of requests per second
     */
    actualizeLastCalledTimestamp(domain, rps) {
        const domainData = this._domains.find(domainDataItem => domainDataItem.domain === domain);
        if (domainData) {
            domainData.lastCalledTimestamp = Date.now();
        } else {
            this._domains.push({ domain: domain, lastCalledTimestamp: Date.now(), RPS: rps });
        }
    }

    /**
     * Checks whether RPS limit of given domain is exceeded or not.
     * Useful to decide whether the domain be called right now or not.
     *
     * @param domain - domain string
     * @return {boolean} - true if the domain is in the map and it's RPS is not exceeded, false otherwise
     * @throws {Error} if there is no such domain in the map
     */
    isRPSExceeded(domain) {
        const domainData = this._domains.find(domainDataItem => domainDataItem.domain === domain);
        if (!domainData) {
            return false;
        }

        return domainData.lastCalledTimestamp + Math.floor(1000 / domainData.RPS) > Date.now();
    }

    /**
     * Returns milliseconds spent from last call of given domain
     * @param domain - domain string
     * @return {number} milliseconds number. Date.now() if there is no data for given domain
     */
    getMsFromLastCall(domain) {
        const domainData = this._domains.find(domainDataItem => domainDataItem.domain === domain);
        return Date.now() - (domainData?.lastCalledTimestamp ?? 0);
    }
}

export const rpsEnsurer = new RPSEnsurer();
