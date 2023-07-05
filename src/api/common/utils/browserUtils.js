import { improveAndRethrow } from "./errorUtils";
import copy from "clipboard-copy";

/**
 * Copies given text to clipboard inside browser.
 *
 * @param text - text to be copied
 */
export function copyBrowserTextToClipboard(text) {
    try {
        if (!copy(text)) {
            throw new Error("Failed to execute copy command.");
        }
    } catch (e) {
        improveAndRethrow(e, "saveTextToFile");
    }
}

/**
 * Downloads a file with the provided text as a content
 *
 * @param text - string of text to be downloaded
 * @param filename - name of downloading file
 */
export function saveTextToFile(text, filename) {
    const a = document.createElement("a");
    try {
        a.setAttribute("href", "data:application/octet-stream;charset=utf-8," + text);
        a.setAttribute("download", filename);
        document.body.appendChild(a);
        a.click();
    } catch (e) {
        improveAndRethrow(e, "saveTextToFile");
    } finally {
        document.body.removeChild(a);
    }
}

/**
 * Retrieves path with params from URL
 *
 * @return {string}
 */
export function getPathWithParams() {
    const fullURL = window.location.href;
    const path = window.location.pathname;
    if (path === "" || path === "/") {
        return path;
    }
    const pathIndex = fullURL.lastIndexOf(path);

    return fullURL.slice(pathIndex);
}

/**
 * Retrieves second.top domains without subdomains, query etc. from given URL
 * @param url - URL string
 * @return {string} pure domain name (second and top levels)
 */
export function getDomainWithoutSubdomains(url) {
    const withoutQuery = url.split("?")[0];
    const domainWithSubDomains =
        withoutQuery.indexOf("//") > -1 ? withoutQuery.split("/")[2] : withoutQuery.split("/")[0];
    const domainParts = domainWithSubDomains.split(".");

    return domainParts.slice(domainParts.length - 2).join(".");
}

export function postponeExecution(execution, timeoutMS = 1000) {
    return new Promise((resolve, reject) => {
        setTimeout(async () => {
            try {
                resolve(await execution());
            } catch (e) {
                reject(e);
            }
        }, timeoutMS);
    });
}

/**
 * Stringify given object by use of JSON.stringify but handles circular structures and "response", "request" properties
 * to avoid stringing redundant data when printing errors containing request/response objects.
 *
 * @param object - object to be stringed
 * @param indent - custom indentation
 * @return {string} - stringed object
 */
export const safeStringify = (object, indent = 2) => {
    let cache = [];
    const retVal = JSON.stringify(
        object,
        (key, value) => {
            if (key.toLowerCase().includes("request")) {
                return JSON.stringify({
                    body: value?.body,
                    query: value?.query,
                    headers: value?.headers,
                });
            }

            if (key.toLowerCase().includes("response")) {
                return JSON.stringify({
                    statusText: value?.statusText,
                    status: value?.status,
                    data: value?.data,
                    headers: value?.headers,
                });
            }

            return typeof value === "object" && value !== null
                ? cache.includes(value)
                    ? "duplicated reference" // Duplicate reference found, discard key
                    : cache.push(value) && value // Store value in our collection
                : value;
        },
        indent
    );
    cache = null;
    return retVal;
};

export function redirect(path) {
    window.location.replace(path);
}

export function reloadThePage() {
    window.location.reload(false);
}
