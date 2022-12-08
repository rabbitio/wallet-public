import Hashes from "jshashes";
import CryptoJS from "crypto-js";

export function getHash(valueToBeHashed) {
    return new Hashes.SHA512().hex(valueToBeHashed);
}

export function getSaltedHash(valueToBeHashed, salt) {
    return new Hashes.SHA512().hex(`${valueToBeHashed}${salt}`);
}

export function encrypt(data, password) {
    return CryptoJS.AES.encrypt(data, password).toString();
}

// TODO: [bug, critical] fails for password === "s"
export function decrypt(encryptedData, password) {
    return CryptoJS.AES.decrypt(encryptedData, password).toString(CryptoJS.enc.Utf8);
}
