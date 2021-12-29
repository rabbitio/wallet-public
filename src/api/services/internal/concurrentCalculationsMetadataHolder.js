import uuid from "uuid";

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
            uuid: uuid.v4(),
        };

        this._calculations[domain].push(newCalculation);

        return newCalculation.uuid;
    }

    endCalculation(domain, uuid, isFailed = false) {
        const calculation = this._calculations[domain].find(calculation => calculation.uuid === uuid);
        calculation.endTimestamp = Date.now();
        calculation.isFiled = isFailed;
        // eslint-disable-next-line no-console
        console.log("CALCTIMESEC: " + domain + " " + (calculation.endTimestamp - calculation.startTimestamp) / 1000);
    }

    isCalculationLate(domain, uuid) {
        const queue = this._calculations[domain];
        const analysingCalculation = queue.find(item => item.uuid === uuid);
        return !!queue.find(
            calculation =>
                calculation.endTimestamp != null && calculation.startTimestamp > analysingCalculation.startTimestamp
        );
    }
}

export const concurrentCalculationsMetadataHolder = new ConcurrentCalculationsMetadataHolder();
