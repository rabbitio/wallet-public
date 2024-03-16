import { v4 } from "uuid";

import { Logger } from "@rabbitio/ui-kit";

import { IS_TESTING } from "../../../../properties.js";
import { ConsoleLogger } from "../../../support/services/internal/logs/consoleLogger.js";

// TODO: [refactoring, low] Consider removing this logic task_id=c360f2af75764bde8badd9ff1cc00d48
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

            const elapsed = (((calculation?.endTimestamp ?? 0) - (calculation?.startTimestamp ?? 0)) / 1000).toFixed(1);
            ConsoleLogger.trace(`${elapsed} ms: ${domain}.${(calculation?.uuid ?? "").slice(0, 7)}`);

            return calculation;
        } catch (e) {
            Logger.logError(e, "endCalculation");
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
        ConsoleLogger.trace(
            `Calculations waiting more than ${(waitingLastsMs / 1000).toFixed(1)}s:\n` +
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
