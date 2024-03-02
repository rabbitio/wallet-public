import * as setCookieParser from "set-cookie-parser";

import { improveAndRethrow } from "@rabbitio/ui-kit";

class CookiesStorage {
    constructor() {
        this.savedCookies = "";
    }

    saveCookiesLocally(response) {
        try {
            if (response.headers) {
                const cookies = response.headers.Cookie || response.headers.cookie;
                if (cookies) {
                    this.savedCookies = cookies;
                } else {
                    let cookies =
                        response.headers["Set-Cookie"] ||
                        response.headers["Set-cookie"] ||
                        response.headers["set-cookie"];
                    if (cookies) {
                        cookies.length === undefined && (cookies = [cookies]); // to array if single header
                        cookies = cookies
                            .map(cookie => {
                                const parsed = setCookieParser.parse(cookie);
                                return parsed && parsed[0];
                            })
                            .map(parsed => `${parsed.name}=${parsed.value}`);
                        this.savedCookies = cookies.join("; "); // to Cookie header format
                    }
                }
            }
        } catch (e) {
            improveAndRethrow(e, "saveCookiesLocally");
        }
    }
    getSavedCookieHeader() {
        return this.savedCookies || "";
    }
    clearSavedCookies() {
        this.savedCookies = "";
    }
}

export const cookieStorage = new CookiesStorage();
