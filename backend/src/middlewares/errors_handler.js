import log4js from "log4js";

const log = log4js.getLogger("errorsHandler");

export default function(err, req, res, next) {
    log.error(err);
}
