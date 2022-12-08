import { improveAndRethrow, logError } from "../../../utils/errorUtils";

class ExternalServicesStatsCollector {
    constructor() {
        this.stats = new Map();
    }

    externalServiceFailed(serviceUrl, message) {
        try {
            const processMessage = (stat, errorMessage) => {
                const errors = stat.errors ?? {};
                if (errorMessage.match(/.*network.+error.*/i)) {
                    errors["networkError"] = (errors["networkError"] || 0) + 1;
                } else if (errorMessage.match(/.*timeout.+exceeded.*/i)) {
                    errors["timeoutExceeded"] = (errors["timeoutExceeded"] || 0) + 1;
                } else if (errors["other"]) {
                    errors["other"].push(message);
                } else {
                    errors["other"] = [message];
                }

                stat.errors = errors;
            };

            if (this.stats.has(serviceUrl)) {
                const stat = this.stats.get(serviceUrl);
                stat.callsCount += 1;
                stat.failsCount += 1;
                processMessage(stat, message);
            } else {
                this.stats.set(serviceUrl, { callsCount: 1, failsCount: 1 });
                processMessage(this.stats.get(serviceUrl), message);
            }
        } catch (e) {
            improveAndRethrow(e, "externalServiceFailed");
        }
    }

    externalServiceCalledWithoutError(serviceUrl) {
        try {
            if (this.stats.has(serviceUrl)) {
                const stat = this.stats.get(serviceUrl);
                stat.callsCount += 1;
            } else {
                this.stats.set(serviceUrl, { callsCount: 1, failsCount: 0 });
            }
        } catch (e) {
            improveAndRethrow(e, "externalServiceCalledWithoutError");
        }
    }

    /**
     * Returns statistics about external services failures.
     * Provides how many calls were performed and what the percent of failed calls. Also returns errors stat.
     *
     * @return {Array<object>} Array of objects of type { failsPerCent: number, calls: number }
     *                         sorted by the highest fails percent desc
     */
    getStats() {
        try {
            return Array.from(this.stats.keys())
                .map(key => {
                    const stat = this.stats.get(key);
                    return {
                        url: key,
                        failsPerCent: ((stat.failsCount / stat.callsCount) * 100).toFixed(2),
                        calls: stat.callsCount,
                        errors: stat.errors ?? [],
                    };
                })
                .sort((s1, s2) => s1.failsPerCent - s2.failsPerCent);
        } catch (e) {
            logError(e, "getStats");
        }
    }
}

export const externalServicesStatsCollector = new ExternalServicesStatsCollector();
