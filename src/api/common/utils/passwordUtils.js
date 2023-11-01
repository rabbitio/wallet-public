/**
 * Estimates brute force attack time and composes message to show to user.
 *
 * @param password {string} password string to estimate brute force attack duration for
 * @returns {string} Message with brute force attack duration estimation
 */
export function generateMessageAboutBruteForceAttackForPassword(password) {
    const probability = 1;
    const estimation = getPasswordBruteForceEstimation(password, probability);

    return (
        `An attacker with a powerful computer (${estimation.mid.ops} ops) ` +
        `will crack your password in ${estimation.mid.message}.`
    );
}

function getPasswordBruteForceEstimation(password, probability = 0.5) {
    const lowOps = { ops: 10000000n, string: "10 million" }; // ordinary computer
    const midOps = { ops: 1000000000000n, string: "1 trillion" }; // powerful computer
    const highOps = { ops: 1000000000000000n, string: "1 thousand of trillions" }; // a thousand of powerful computers

    const picoSecond = 0.000000000001;
    const nanoSecond = 0.000000001;
    const mcSecond = 0.000001;
    const mSecond = 0.001;
    const secondsInHour = 60n * 60n;
    const secondsInDay = secondsInHour * 24n;
    const secondsInYear = secondsInDay * 365n;
    const secondsInCentury = secondsInYear * 100n;
    const secondsInMillionOfCenturies = secondsInCentury * 1000000n;
    const secondsInTrillionOfCenturies = secondsInMillionOfCenturies * 1000000n;

    if (probability > 1 || probability <= 0) {
        throw new Error(`Probability must be between 0 (excluding) and 1 (inclusive) but got ${probability}. `);
    }

    !password && (password = "");
    const passwordLength = password.length;

    const subAlphabets = [
        { regex: /[a-z]/g, size: 26 },
        { regex: /[A-Z]/g, size: 26 },
        { regex: /[0-9]/g, size: 10 },
        { regex: / !"#\$%&'\(\)\*\+,-\.\/:;<=>\?@\[\\\\]\^_`\\{|}~/g, size: 33 }, // Special symbols alphabet: ' !"#$%&'()*+,-./:;<=>?@[\]^_`{|}~'
    ];

    let alphabetSize = 0;
    let currentLength = password.length;
    subAlphabets.forEach(subAlphabet => {
        password = password.replace(subAlphabet.regex, "");
        if (password.length !== currentLength) {
            alphabetSize += subAlphabet.size;
            currentLength = password.length;
        }
    });

    if (password.length) {
        // TODO: [feature, low] Support other languages
        // TODO: [feature, critical] throw error and process it as a validation fail if there are still symbols
        alphabetSize += 33; // for the rest symbols
    }

    // TODO: [refactoring, moderate] remove ugly workarounds with window.BigInt and manual exponentiation after upgrading to the last NODE version. task_id=ceef7a6597234677bac35802ad3a574c
    // let searchSpace = window.BigInt(alphabetSize) ** window.BigInt(passwordLength);
    let searchSpace = 1n;
    for (let i = 0; i < passwordLength; ++i) {
        searchSpace *= window.BigInt(alphabetSize);
    }
    searchSpace = (searchSpace * window.BigInt(Math.ceil(probability * 100))) / 100n;
    const lowOpsTime = searchSpace / lowOps.ops;
    const midOpsTime = searchSpace / midOps.ops;
    const highOpsTime = searchSpace / highOps.ops;

    const getMessage = (opsTime, opsData) => {
        if (opsTime > secondsInTrillionOfCenturies) {
            return `more than 1 trillion centuries`;
        } else if (opsTime > secondsInMillionOfCenturies) {
            const millionOfCenturies = opsTime / secondsInMillionOfCenturies;
            return `${millionOfCenturies.toString()} millions of centuries`;
        } else if (opsTime > secondsInCentury) {
            const centuries = opsTime / secondsInCentury;
            return `${centuries.toString()} centuries`;
        } else if (opsTime > secondsInYear) {
            const years = opsTime / secondsInYear;
            return `${years.toString()} years`;
        } else if (opsTime > secondsInDay) {
            const days = opsTime / secondsInDay;
            return `${days.toString()} days`;
        } else if (opsTime > secondsInHour) {
            const hours = opsTime / secondsInHour;
            return `${hours.toString()} hours`;
        } else if (opsTime > 1n) {
            return `${opsTime} seconds`;
        } else {
            const opsCount = Number(searchSpace.toString());
            const time = (opsCount / Number(opsData.ops.toString())).toFixed(12);
            if (time > mSecond) {
                const ms = time / mSecond;
                return `${Math.round(ms)} milliseconds`;
            } else if (time > mcSecond) {
                const mcs = time / mcSecond;
                return `${Math.round(mcs)} microseconds`;
            } else if (time > nanoSecond) {
                const nanos = time / nanoSecond;
                return `${Math.round(nanos)} nanoseconds`;
            } else {
                const picos = time / picoSecond;
                return `${Math.round(picos)} picoseconds`;
            }
        }
    };

    return {
        low: { ops: lowOps.string, message: getMessage(lowOpsTime, lowOps) },
        mid: { ops: midOps.string, message: getMessage(midOpsTime, midOps) },
        high: { ops: highOps.string, message: getMessage(highOpsTime, highOps) },
    };
}
