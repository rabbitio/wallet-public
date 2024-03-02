import QRCode from "qrcode";

import { improveAndRethrow } from "@rabbitio/ui-kit";

/**
 * Generates QR as svg xml string.
 * Note that you should care about the element size by your self - the generated QR will just fill all available space
 *
 * @param encodingString {string} to be encoded as QR-code image
 * @return {Promise<string>} xml string of generated svg image
 */
export async function generateQrAndShowInCanvas(encodingString) {
    try {
        return await QRCode.toString(encodingString, { type: "svg" });
    } catch (e) {
        improveAndRethrow(e, "generateQrAndShowInCanvas");
    }
}
