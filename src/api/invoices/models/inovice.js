import { v4 } from "uuid";
import { decrypt, encrypt } from "../../common/adapters/crypto-utils";

export class Invoice {
    constructor(
        name,
        amountBtc,
        address,
        isPaid = false,
        id = v4(),
        creationTime = new Date(),
        label = "",
        message = ""
    ) {
        this.name = name;
        this.amountBtc = +amountBtc;
        this.address = address;
        this.isPaid = isPaid;
        this.uuid = id;
        this.creationTime = +creationTime;
        this.label = label;
        this.message = message;
    }

    serializeAndEncrypt(dataPassword) {
        this.creationTime = +this.creationTime; // To ensure milliseconds format
        const serialized = JSON.stringify(this);
        return encrypt(serialized, dataPassword);
    }

    static decryptAndDeserialize(encryptedSerializedData, dataPassword) {
        const decrypted = decrypt(encryptedSerializedData, dataPassword);
        const json = JSON.parse(decrypted);
        return new Invoice(
            json.name,
            json.amountBtc,
            json.address,
            json.isPaid,
            json.uuid,
            json.creationTime,
            json.label,
            json.message
        );
    }
}
