const queuesForTimeoutActions = {};

// TODO: [refactoring, moderate] This module is not used anymore so should be removed
export function addRepeatableSkippableActionWithMinDelay(actionType, action, actionFireDelayMillis, minDelayMillis) {
    const runForce = false;
    addRepeatableActionWithMinDelay(actionType, action, runForce, actionFireDelayMillis, minDelayMillis);
}

export function addRepeatableNotSkippableActionWithMinDelay(actionType, action, actionFireDelayMillis, minDelayMillis) {
    const runForce = true;
    addRepeatableActionWithMinDelay(actionType, action, runForce, actionFireDelayMillis, minDelayMillis);
}

/**
 * Sometime you have task that should be executed by schedule and also as a reaction on some other events.
 * In such case there are possible situation when event-caused task execution will be followed by almost
 * immediate schedule-caused task execution. But such execution can be pretty redundant.
 * This method allows to avoid such cases by analysing current tasks queue and removing such redundant
 * scheduled executions.
 * Also the method allows to schedule non-skippable tasks as far as skippable for the same actionType.
 * Also expired skippable tasks will be removed from the queue automatically.
 *
 * // [docs, moderate]
 * These functions is safe as according to JS concurrency model plane function cannot be
 * paused during the execution to execute something else.
 */

function addRepeatableActionWithMinDelay(actionType, action, runForce, actionFireDelayMillis, minDelayMillis) {
    if (!minDelayMillis) {
        minDelayMillis = Math.round(actionFireDelayMillis * 0.8);
    }

    if (queuesForTimeoutActions[actionType]) {
        removeAllActionsRunningInLessThenMinDelayAfterOrBeforeNewAction(
            actionType,
            actionFireDelayMillis,
            minDelayMillis
        );
    }

    addNewActionToQueue(actionType, action, runForce, actionFireDelayMillis, minDelayMillis);
}

/**
 * Removes all actions that are going to be run before/after new action in less than minDelayMillis.
 * It helps to avoid several sequential calls of the same action.
 *
 * Only running action can use current state of array of queues and anyway we cannot remove running actions
 * so this call will not cause dirtying of data in array of queues.
 */
function removeAllActionsRunningInLessThenMinDelayAfterOrBeforeNewAction(
    actionType,
    newActionFireDelayMillis,
    minDelayMillis
) {
    const newActionFireTimeMillis = Date.now() + newActionFireDelayMillis;
    queuesForTimeoutActions[actionType] = queuesForTimeoutActions[actionType].filter(actionData => {
        if (!actionData.isRunning && !actionData.runForce) {
            const gapBetweenActionsMillis = Math.abs(actionData.fireTimeMillis - newActionFireTimeMillis);
            if (gapBetweenActionsMillis < minDelayMillis) {
                clearTimeout(actionData.action);
                return false;
            }
        }

        return true;
    });
}

function addNewActionToQueue(actionType, action, runForce, actionFireDelayMillis, minDelayMillis) {
    removeAllExpiredOrRunningLessThenInMinDelayTimeOrExecutedForceActions(actionType, minDelayMillis);
    if (!queuesForTimeoutActions[actionType]) {
        queuesForTimeoutActions[actionType] = [];
    }

    queuesForTimeoutActions[actionType].push({
        action: setTimerForActionExecution(actionType, action, runForce, actionFireDelayMillis, minDelayMillis),
        fireTimeMillis: Date.now() + actionFireDelayMillis,
        runForce: runForce,
        isRunning: false,
        executed: false,
    });
}

function removeAllExpiredOrRunningLessThenInMinDelayTimeOrExecutedForceActions(actionType, minDelayMillis) {
    if (queuesForTimeoutActions[actionType]) {
        const newActionsDataList = [];
        queuesForTimeoutActions[actionType].forEach(actionData => {
            if (!actionData.runForce) {
                const remindedTime = actionData.fireTimeMillis - Date.now();
                if (remindedTime < minDelayMillis) {
                    clearTimeout(actionData.action);
                } else {
                    newActionsDataList.push(actionData);
                }
            } else if (!actionData.executed) {
                newActionsDataList.push(actionData);
            }
        });

        queuesForTimeoutActions[actionType] = newActionsDataList;
    }
}

function setTimerForActionExecution(actionType, action, runForce, fireDelayMillis, minDelayMillis) {
    return setTimeout(() => {
        executeAction(actionType, action, runForce, minDelayMillis);
    }, fireDelayMillis);
}

function executeAction(actionType, action, runForce, minDelayMillis) {
    if (!isTheSameActionRunning(actionType)) {
        try {
            setActionIsRunningFlag(actionType, action);
            // eslint-disable-next-line no-console
            console.log(`Start running action '${actionType}'`);
            action();
            // eslint-disable-next-line no-console
            console.log(`Action has finished '${actionType}'`);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.log(`Action run has failed '${actionType}'.`, e);
        } finally {
            markActionAsExecuted(actionType, action);
        }
    } else if (runForce) {
        markActionAsExecuted(actionType, action); // to allow its deletion
        const newFireDelay = Math.round(minDelayMillis * 0.1 + 100);
        addNewActionToQueue(actionType, action, runForce, newFireDelay, minDelayMillis);
    } else {
        // eslint-disable-next-line no-console
        console.log(`Skipping [${actionType}] execution as the same action is running`);
    }
}

function isTheSameActionRunning(actionType) {
    if (queuesForTimeoutActions[actionType]) {
        return queuesForTimeoutActions[actionType].filter(actionData => actionData.isRunning).length > 0;
    }
}

function setActionIsRunningFlag(actionType, action) {
    if (queuesForTimeoutActions[actionType]) {
        const actionData = queuesForTimeoutActions[actionType].filter(actionData => actionData.action === action);
        actionData.isRunning = true;
    }
}

function markActionAsExecuted(actionType, action) {
    const actionData = queuesForTimeoutActions[actionType].filter(actionData => actionData.action === action);
    actionData.executed = true;
}
