import QRCode from "qrcode";
import { improveAndRethrow } from "../utils/errorUtils";

/**
 * Generates QR and draws it at passed canvas HTML DOM element.
 * Note that you should care about the element size by your self - the generated QR will just fill all available space
 *
 * @param canvasHtmlElement - canvas to draw QR on
 * @param encodingString - string to be encoded as QR code image
 * @return Promise resolving to void
 */
export async function generateQrAndShowInCanvas(canvasHtmlElement, encodingString) {
    try {
        return await QRCode.toCanvas(canvasHtmlElement, encodingString);
    } catch (e) {
        improveAndRethrow(e, "generateQrAndShowInCanvas");
    }
}
