import uuid from "uuid";
import PaymentUrlService from "../services/paymentUrlService";
import { decrypt, encrypt } from "../adapters/crypto-utils";

export class Invoice {
    constructor(
        name,
        amountBtc,
        address,
        isPaid = false,
        id = uuid(),
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
        this.paymentUrl = PaymentUrlService.generatePaymentUrl(address, amountBtc, label, message);
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

    recalculatePaymentUrl() {
        this.paymentUrl = PaymentUrlService.generatePaymentUrl(this.address, this.amountBtc, this.label, this.message);
    }
}
