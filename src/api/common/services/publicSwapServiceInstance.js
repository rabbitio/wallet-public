import { PublicSwapService } from "@rabbitio/ui-kit";

import { cache } from "../utils/cache.js";
import { API_KEYS_PROXY_URL } from "../backend-api/utils.js";

export const publicSwapServiceInstance = new PublicSwapService(API_KEYS_PROXY_URL + "/swapspace", cache);
