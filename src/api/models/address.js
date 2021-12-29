import { decrypt, encrypt } from "../adapters/crypto-utils";

// TODO: [tests, low]
export default class Address {
    static labelAutogenerated = "Autogenerated";

    constructor(address, label = null, creationTime = +Date.now()) {
        this.address = address;
        this.creationTime = creationTime;
        this.label = label;
    }

    encryptAndSerialize(dataPassword) {
        this.creationTime = +this.creationTime; // To ensure milliseconds format
        const serialized = JSON.stringify(this);
        return encrypt(serialized, dataPassword);
    }

    static decryptAndDeserialize(encryptedSerializedData, dataPassword) {
        const decrypted = decrypt(encryptedSerializedData, dataPassword);
        const json = JSON.parse(decrypted);
        return new Address(json.address, json.label, json.creationTime);
    }
}
