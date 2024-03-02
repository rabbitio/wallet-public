import { Blockchain } from "../common/models/blockchain.js";
import { TRC20 } from "../trc20token/trc20Protocol.js";

export const TRON_BLOCKCHAIN = new Blockchain("Tron blockchain", [TRC20]);
