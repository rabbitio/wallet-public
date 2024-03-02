import MongoClient from "mongodb";

export class ConnectWrapper {
    /**
     * Wrapper needed to be able to mock the connect call due to bad exporting approach of mongodb driver
     */
    static connectWrapper(url, options) {
        return MongoClient.connect(url, options);
    }
}
