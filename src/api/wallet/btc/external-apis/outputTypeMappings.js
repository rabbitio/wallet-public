import { ApiGroups } from "@rabbitio/ui-kit";

import { P2PKH_SCRIPT_TYPE, P2SH_SCRIPT_TYPE, P2WPKH_SCRIPT_TYPE } from "../lib/utxos.js";

export const mappingsPerProvider = new Map([
    [
        ApiGroups.BLOCKSTREAM,
        new Map([
            ["v0_p2wpkh", P2WPKH_SCRIPT_TYPE],
            ["p2pkh", P2PKH_SCRIPT_TYPE],
            ["p2sh", P2SH_SCRIPT_TYPE],
        ]),
    ],
    [
        ApiGroups.BITAPS,
        new Map([
            ["P2WPKH", P2WPKH_SCRIPT_TYPE],
            ["P2PKH", P2PKH_SCRIPT_TYPE],
            ["P2SH", P2SH_SCRIPT_TYPE],
        ]),
    ],
    [
        ApiGroups.BTCCOM,
        new Map([
            ["P2WPKH_V0", P2WPKH_SCRIPT_TYPE],
            ["P2PKH", P2PKH_SCRIPT_TYPE],
            ["P2SH", P2SH_SCRIPT_TYPE],
        ]),
    ],
]);
