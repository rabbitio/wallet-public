import ipaddr from "ipaddr.js";
import { improveAndRethrow } from "../../../common/utils/errorUtils";

export class IpsServiceInternal {
    /**
     * Provides the same string for the same addresses written differently to get the same hashes for same IPs
     */
    static ipToStringOfBytes(ip) {
        try {
            const bytesArray = ipaddr.parse(ip).toByteArray();
            return bytesArray.join(",");
        } catch (e) {
            improveAndRethrow(e, "ipToStringOfBytes", `Parsing failed. IP: ${ip})}`);
        }
    }
}
