import morgan from "morgan";
import fs from "fs";
import path from "path";

const accessLogStream = fs.createWriteStream(path.join(__dirname, "access.log"), { flags: "a" });

module.exports = morgan("combined", { stream: accessLogStream });
