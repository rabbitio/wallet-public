import MongoClient from "mongodb";

/**
 * Wrapper needed to be able to mock the connect call due to bad exporting approach of mongodb driver
 */
export function connectWrapper(url, options) {
    return MongoClient.connect(url, options);
}
