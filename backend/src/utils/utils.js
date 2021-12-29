import { mkdirSync } from "fs";
import { configure } from "log4js";

export function improveAndRethrow(e, settingFunction, additionalMessage) {
    const message = improvedErrorMessage(e, settingFunction, additionalMessage);
    if (e) {
        e.message = message;
        if (!e.alternativeStack) {
            const tempObj = {};
            Error.captureStackTrace(tempObj);
            e.alternativeStack = tempObj.stack;
        }
        throw e; // to preserve existing stacktrace if present
    }
    throw new Error(message);
}

function improvedErrorMessage(e, settingFunction, additionalMessage) {
    let message = `\nFunction call ${settingFunction} failed.`;

    e && e.message && (message += `Error message: ${e.message}. `);
    additionalMessage && (message += `${additionalMessage} `);

    return message;
}

export function configureLogging() {
    // Make a log directory, just in case it isn't there
    try {
        mkdirSync("./log");
    } catch (e) {
        if (e.code !== "EEXIST") {
            // eslint-disable-next-line no-console
            console.error("Could not set up log directory, error was: ", e);
            process.exit(1);
        }
    }

    try {
        configure("./src/log4js.json");
    } catch (e) {
        configure("./backend/src/log4js.json");
    }
}

export function formatUTCDate(date) {
    const mm = date.getUTCMonth() + 1; // getMonth() is zero-based
    const dd = date.getUTCDate();

    return {
        dd: (dd > 9 ? "" : "0") + dd,
        mm: (mm > 9 ? "" : "0") + mm,
        yyyy: date.getUTCFullYear(),
    };
}

/**
 * Retrieves UTC day start by given Date object (representing local time).
 * Needed as there is no neat way to retrieve the day start from the Date object.
 *
 * @param date - Date to get start for
 * @return Date object representing UTC day start of given local date
 */
export function getUTCDateStartByLocalDate(date) {
    const utcOffset = new Date().getTimezoneOffset() * 60000 * -1;
    const dateUTC = new Date(date - utcOffset);
    const utcDateStart =
        dateUTC.getTime() -
        dateUTC.getHours() * 3600000 -
        dateUTC.getMinutes() * 60000 -
        dateUTC.getSeconds() * 1000 -
        dateUTC.getMilliseconds();

    return new Date(utcDateStart + utcOffset);
}

/**
 * Helps to build proper date object on base of given UTC timestamp.
 * The difficulty is that the new Date(timestamp) considers the given timestamp as local and there is no neat way to
 * force it to consider the timestamp as UTC milliseconds.
 *
 * @param timestamp - number
 * @return Date - UTC date on base of given timestamp
 */
export function getLocalDateByUTCTimestamp(timestamp) {
    const utcOffset = new Date().getTimezoneOffset() * 60000 * -1;
    return new Date(+timestamp + utcOffset);
}
