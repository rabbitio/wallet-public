const TRON_BLOCK_TIME_MS = 3000;
export const computeConfirmationsCountByTimestamp = timestampMs =>
    timestampMs ? Math.round((Date.now() - timestampMs) / TRON_BLOCK_TIME_MS) : 0;
