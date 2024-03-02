import log4js from "log4js";
import { verify } from "crypto";
import stableStringify from "fast-json-stable-stringify";

import { RAMP_PUBLIC_KEY } from "../properties.js";
import RampPaymentsService from "../services/rampPaymentsService.js";

const log = log4js.getLogger("webhooksController");

// TODO [feature, high] Should be removed/improved in task_id=-16127916f375490aa6b526675a6c72e4
export class WebhooksController {
    static async handleRampEvents(req, res) {
        if (req.body && req.header("X-Body-Signature")) {
            log.debug("Correct ramp webhook request received");
            const verified = verify(
                "sha256",
                Buffer.from(stableStringify(req.body)),
                RAMP_PUBLIC_KEY,
                Buffer.from(req.header("X-Body-Signature"), "base64")
            );

            if (verified) {
                log.debug("Ramp webhook request was successfully verified (signature). Proceeding data processing");
                res.status(204).send();
                await RampPaymentsService.handleRampNetworkPaymentEvent(req.body);
            } else {
                log.info("Ramp response has invalid signature");
                res.status(401).send();
            }
        } else {
            log.info("Ramp sent a wrong request " + (req.body ? "X-BodySignature header" : "body"));
            res.status(401).send();
        }
    }
}
