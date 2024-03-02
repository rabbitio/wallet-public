import { BigNumber } from "bignumber.js";

/**
 * Estimates brute force attack time and composes message to show to user.
 *
 * @param password {string} password string to estimate brute force attack duration for
 * @returns {string} Message with brute force attack duration estimation
 */
export function generateMessageAboutBruteForceAttackForPassword(password) {
    const probability = 1;
    const estimation = getPasswordBruteForceEstimation(password, probability);

    return `An attacker with a powerful computer will crack your password in ${estimation.mid.message}.`;
}

function getPasswordBruteForceEstimation(password, probability = 0.5) {
    const lowOps = { ops: 10000000n, string: "10 million" }; // ordinary computer
    const midOps = { ops: 1000000000000n, string: "1 trillion" }; // powerful computer
    const highOps = { ops: 1000000000000000n, string: "1 thousand of trillions" }; // a thousand of powerful computers

    const picoSecond = 0.000000000001;
    const nanoSecond = 0.000000001;
    const mcSecond = 0.000001;
    const mSecond = 0.001;
    const secondsInHour = BigNumber(60 * 60);
    const secondsInDay = secondsInHour.times(24);
    const secondsInYear = secondsInDay.times(365);
    const secondsInCentury = secondsInYear.times(100);
    const secondsInMillionOfCenturies = secondsInCentury.times(1000000);
    const secondsInTrillionOfCenturies = secondsInMillionOfCenturies.times(1000000);

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
        // TODO: [feature, low] throw error and process it as a validation fail if there are still symbols
        alphabetSize += 33; // for the rest symbols
    }

    let searchSpace = BigNumber(1);
    for (let i = 0; i < passwordLength; ++i) {
        searchSpace = searchSpace.times(alphabetSize);
    }
    searchSpace = searchSpace.times(Math.ceil(probability * 100)).div(100);
    const lowOpsTime = searchSpace.div(lowOps.ops);
    const midOpsTime = searchSpace.div(midOps.ops);
    const highOpsTime = searchSpace.div(highOps.ops);

    const getMessage = (opsTime, opsData) => {
        if (opsTime.gt(secondsInTrillionOfCenturies)) {
            return `more than 1 trillion centuries`;
        } else if (opsTime.gt(secondsInMillionOfCenturies)) {
            const millionOfCenturies = opsTime.div(secondsInMillionOfCenturies).integerValue().toString();
            return `${millionOfCenturies} millions of centuries`;
        } else if (opsTime.gt(secondsInCentury)) {
            const centuries = opsTime.div(secondsInCentury).integerValue().toString();
            return `${centuries} centuries`;
        } else if (opsTime.gt(secondsInYear)) {
            const years = opsTime.div(secondsInYear).integerValue().toString();
            return `${years} years`;
        } else if (opsTime.gt(secondsInDay)) {
            const days = opsTime.div(secondsInDay).integerValue().toString();
            return `${days} days`;
        } else if (opsTime.gt(secondsInHour)) {
            const hours = opsTime.div(secondsInHour).integerValue().toString();
            return `${hours} hours`;
        } else if (opsTime.gt(1)) {
            return `${opsTime} seconds`;
        } else {
            const time = searchSpace.div(opsData.ops);
            if (time > mSecond) {
                const ms = time.div(mSecond).integerValue().toString();
                return `${ms} milliseconds`;
            } else if (time.gt(mcSecond)) {
                const mcs = time.div(mcSecond).integerValue().toString();
                return `${mcs} microseconds`;
            } else if (time.gt(nanoSecond)) {
                const nanos = time.div(nanoSecond).integerValue().toString();
                return `${nanos} nanoseconds`;
            } else {
                const picos = time.div(picoSecond).integerValue().toString();
                return `${picos} picoseconds`;
            }
        }
    };

    return {
        low: { ops: lowOps.string, message: getMessage(lowOpsTime, lowOps) },
        mid: { ops: midOps.string, message: getMessage(midOpsTime, midOps) },
        high: { ops: highOps.string, message: getMessage(highOpsTime, highOps) },
    };
}
