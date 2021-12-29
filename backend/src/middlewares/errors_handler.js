import {getLogger} from "log4js";

const log = getLogger("errorsHandler");

export default function (err, req, res, next) {
    log.error(err);
};
