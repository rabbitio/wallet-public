export class Blockchain {
    /**
     * @param name {string} latin printable name of blockchain
     * @param supportedProtocols {Protocol[]}
     */
    constructor(name, supportedProtocols = []) {
        this.name = name;
        this.supportedProtocols = supportedProtocols;
    }
}
