import { Blockchain } from "../common/models/blockchain";
import { TRC20 } from "../trc20token/trc20Protocol";

export const TRON_BLOCKCHAIN = new Blockchain("Tron blockchain", [TRC20]);
