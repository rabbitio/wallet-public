import RobustExternalAPICallerService from "../utils/robustExternalAPICallerService";
import { improveAndRethrow } from "../utils/errorUtils";

/**
 * We use several providers to ensure the IP address is retrieved in case of unavailability of one of services
 */
const providers = [
    {
        endpoint: "https://api.bigdatacloud.net/data/client-ip",
        httpMethod: "get",
        composeQueryString: () => "",
        getDataByResponse: response => {
            return response?.data && response.data?.ipString;
        },
    },
    {
        endpoint: "https://www.trackip.net/ip",
        httpMethod: "get",
        composeQueryString: () => "",
        getDataByResponse: response => {
            return response?.data;
        },
    },
    {
        endpoint: "https://api6.ipify.org/?format=json",
        httpMethod: "get",
        composeQueryString: () => "",
        getDataByResponse: response => {
            return response?.data && response.data?.ip;
        },
    },
    {
        endpoint: "https://api.ipify.org/?format=json",
        httpMethod: "get",
        composeQueryString: () => "",
        getDataByResponse: response => {
            return response?.data && response.data?.ip;
        },
    },
    {
        endpoint: "http://bot.whatismyipaddress.com/",
        httpMethod: "get",
        composeQueryString: () => "",
        getDataByResponse: response => {
            return response?.data;
        },
    },
];

export default class IpAddressProvisioningService {
    static externalIPAddressAPICaller = new RobustExternalAPICallerService("externalIPAddressAPICaller", providers);

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
            return this.externalIPAddressAPICaller.callExternalAPI([], 7000);
        } catch (e) {
            improveAndRethrow(e, "getClientIpAddress");
        }
    }
}
