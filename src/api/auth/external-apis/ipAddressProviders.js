import { CachedRobustExternalApiCallerService } from "../../common/services/utils/robustExteranlApiCallerService/cachedRobustExternalApiCallerService";
import { improveAndRethrow } from "../../common/utils/errorUtils";
import { ExternalApiProvider } from "../../common/services/utils/robustExteranlApiCallerService/externalApiProvider";
import { ApiGroups } from "../../common/external-apis/apiGroups";

class BigdatacloudIpAddressProvider extends ExternalApiProvider {
    constructor() {
        super("https://api.bigdatacloud.net/data/client-ip", "get", 15000, ApiGroups.BIGDATACLOUD);
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        return response?.data && response.data?.ipString;
    }
}

class TrackipIpAddressProvider extends ExternalApiProvider {
    constructor() {
        super("https://www.trackip.net/ip", "get", 15000, ApiGroups.TRACKIP);
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        return response?.data;
    }
}

class IpifyV6IpAddressProvider extends ExternalApiProvider {
    constructor() {
        super("https://api6.ipify.org/?format=json", "get", 15000, ApiGroups.IPIFY);
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        return response?.data && response.data?.ip;
    }
}

class IpifyIpAddressProvider extends ExternalApiProvider {
    constructor() {
        super("https://api.ipify.org/?format=json", "get", 15000, ApiGroups.IPIFY);
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        return response?.data && response.data?.ip;
    }
}

class WhatismyipaddressIpAddressProvider extends ExternalApiProvider {
    constructor() {
        super("http://bot.whatismyipaddress.com/", "get", 15000, ApiGroups.WHATISMYIPADDRESS);
    }

    getDataByResponse(response, params = [], subRequestIndex = 0, iterationsData = []) {
        return response?.data;
    }
}

export default class IpAddressProvider {
    static externalIPAddressAPICaller = new CachedRobustExternalApiCallerService(
        "externalIPAddressAPICaller",
        [
            new BigdatacloudIpAddressProvider(),
            new TrackipIpAddressProvider(),
            new IpifyV6IpAddressProvider(),
            new IpifyIpAddressProvider(),
            new WhatismyipaddressIpAddressProvider(),
        ],
        180000,
        30,
        2000
    );

    /**
     * Returns current public IP address identified by one of external services.
     *
     * It is easier than manual identification and also (as ip needed for server side to check it) it saves us from
     * issues related to changes of infrastructure configurations (like adding proxies etc.) so we should not configure
     * anything on server side to get correct client's IP.
     * @returns String - IP address
     * @throws Error if fails to retrieve IP address from all the services
     */
    static async getClientIpAddress() {
        try {
            return this.externalIPAddressAPICaller.callExternalAPICached([], 7000);
        } catch (e) {
            improveAndRethrow(e, "getClientIpAddress");
        }
    }
}
