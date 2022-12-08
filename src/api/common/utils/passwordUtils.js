import { Decimal } from "decimal.js-light";

/**
 * Estimates brute force attack time and composes message to show to user.
 *
 * @param password - password string to estimate brute force attack duration for
 * @returns Message with brute force attack duration estimation
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
    const lowOps = { ops: new Decimal("10000000"), string: "10 million" }; // ordinary computer
    const midOps = { ops: new Decimal("1000000000000"), string: "1 trillion" }; // powerful computer
    const highOps = { ops: new Decimal("1000000000000000"), string: "1 thousand of trillions" }; // thousand of powerful computers

    const picoSecond = 0.000000000001;
    const nanoSecond = 0.000000001;
    const mcSecond = 0.000001;
    const mSecond = 0.001;
    const secondsInHour = new Decimal(60 * 60);
    const secondsInDay = secondsInHour.mul(24);
    const secondsInYear = secondsInDay.mul(365);
    const secondsInCentury = secondsInYear.mul(100);
    const secondsInMillionOfCenturies = secondsInCentury.mul(1000000);
    const secondsInTrillionOfCenturies = secondsInMillionOfCenturies.mul(1000000);

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

    const searchSpace = new Decimal(alphabetSize).pow(new Decimal(passwordLength)).mul(new Decimal(probability));

    const lowOpsTime = searchSpace.dividedToIntegerBy(lowOps.ops);
    const midOpsTime = searchSpace.dividedToIntegerBy(midOps.ops);
    const highOpsTime = searchSpace.dividedToIntegerBy(highOps.ops);

    const getMessage = (opsTime, opsData) => {
        if (opsTime.gt(secondsInTrillionOfCenturies)) {
            return `more than 1 trillion centuries`;
        } else if (opsTime.gt(secondsInMillionOfCenturies)) {
            const millionOfCenturies = opsTime.div(secondsInMillionOfCenturies);
            return `${millionOfCenturies.toFixed(2)} millions of centuries`;
        } else if (opsTime.gt(secondsInCentury)) {
            const centuries = opsTime.div(secondsInCentury);
            return `${centuries.toFixed(2)} centuries`;
        } else if (opsTime.gt(secondsInYear)) {
            const years = opsTime.div(secondsInYear);
            return `${years.toFixed(2)} years`;
        } else if (opsTime.gt(secondsInDay)) {
            const days = opsTime.div(secondsInDay);
            return `${days.toFixed(2)} days`;
        } else if (opsTime.gt(secondsInHour)) {
            const hours = opsTime.div(secondsInHour);
            return `${hours.toFixed(2)} hours`;
        } else if (opsTime.gt(new Decimal(1))) {
            return `${opsTime} seconds`;
        } else {
            const opsCount = searchSpace.toNumber();
            const time = (opsCount / opsData.ops.toNumber()).toFixed(12);
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
