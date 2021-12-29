import { ApiCallWrongResponseError } from "../external-apis/backend-api/utils";
import { safeStringify } from "./browserUtils";

export function improveAndRethrow(e, settingFunction, additionalMessage) {
    const message = improvedErrorMessage(e, settingFunction, additionalMessage);
    if (e) {
        e.message = message;
        throw e; // to preserve existing stacktrace if present
    }
    throw new Error(message);
}

function improvedErrorMessage(e, settingFunction, additionalMessage) {
    let message = `\nFunction call ${settingFunction ? settingFunction.name || settingFunction : ""} failed. `;
    e && e.message && (message += `Error message: ${e.message}. `);
    additionalMessage && (message += `${additionalMessage} `);

    return message;
}

export function logError(e, settingFunction, additionalMessage) {
    let message = improvedErrorMessage(e, settingFunction, additionalMessage);
    const specificErrorInfo = getSpecificInfoFromError(e);
    specificErrorInfo && (message += specificErrorInfo);

    if (!specificErrorInfo && e && e.response) {
        try {
            const responseData = safeStringify({ response: e.response });
            responseData && (message += `\n${responseData}. `);
        } catch (e) {}
    }

    // eslint-disable-next-line no-console
    console.error(message + " " + safeStringify(e));
}

export function getSpecificInfoFromError(e) {
    if (e instanceof ApiCallWrongResponseError && e.isForbiddenError()) {
        return "Authentication has expired or was lost. ";
    }

    if (e && e.errorDescription && e.howToFix) {
        return `${e.errorDescription}${e.howToFix}`;
    }

    return "";
}
