import { improveAndRethrow } from "@rabbitio/ui-kit";

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

export function redirect(path) {
    window.location.replace(path);
}

export function reloadThePage() {
    window.location.reload(false);
}
