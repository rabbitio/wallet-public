import { v4 } from "uuid";
import { logError } from "../../utils/errorUtils";
import { IS_TESTING } from "../../../../properties";

class ConcurrentCalculationsMetadataHolder {
    constructor() {
        this._calculations = {};
    }

    startCalculation(domain, calculationsHistoryMaxLength = 100) {
        if (!this._calculations[domain]) {
            this._calculations[domain] = [];
        }

        if (this._calculations[domain].length > calculationsHistoryMaxLength) {
            this._calculations[domain] = this._calculations[domain].slice(
                Math.round(calculationsHistoryMaxLength * 0.2)
            );
        }

        const newCalculation = {
            startTimestamp: Date.now(),
            endTimestamp: null,
            uuid: v4(),
        };

        this._calculations[domain].push(newCalculation);

        return newCalculation.uuid;
    }

    endCalculation(domain, uuid, isFailed = false) {
        try {
            const calculation = this._calculations[domain].find(calculation => calculation?.uuid === uuid);
            if (calculation) {
                calculation.endTimestamp = Date.now();
                calculation.isFiled = isFailed;
            }

            // eslint-disable-next-line no-console
            console.log(
                `CALC END: ${domain}.${(calculation?.uuid ?? "").slice(0, 7)} - ${(calculation?.startTimestamp ?? 0) -
                    (calculation?.endTimestamp ?? 0)} ms`
            );

            return calculation;
        } catch (e) {
            logError(e, "endCalculation");
        }
    }

    isCalculationLate(domain, uuid) {
        const queue = this._calculations[domain];
        const analysingCalculation = queue.find(item => item.uuid === uuid);
        return (
            analysingCalculation &&
            !!queue.find(
                calculation =>
                    calculation.endTimestamp != null && calculation.startTimestamp > analysingCalculation.startTimestamp
            )
        );
    }

    printCalculationsWaitingMoreThanSpecifiedSeconds(waitingLastsMs = 2000) {
        const calculations = Object.keys(this._calculations)
            .map(domain => this._calculations[domain].map(c => ({ ...c, domain })))
            .flat()
            .filter(c => c.endTimestamp === null && Date.now() - c.startTimestamp > waitingLastsMs);
        // eslint-disable-next-line no-console
        console.log(
            `CALCULATIONS WAITING more than ${waitingLastsMs} ms:\n` +
                calculations.map(c => `${c.domain}.${c.uuid.slice(0, 8)}: ${Date.now() - c.startTimestamp}\n`)
        );
    }
}

export const concurrentCalculationsMetadataHolder = new ConcurrentCalculationsMetadataHolder();

!IS_TESTING &&
    setInterval(
        () => concurrentCalculationsMetadataHolder.printCalculationsWaitingMoreThanSpecifiedSeconds(5200),
        5000
    );
