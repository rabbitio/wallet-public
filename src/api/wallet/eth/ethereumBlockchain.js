import { Blockchain } from "../common/models/blockchain";
import { ERC20 } from "../erc20token/erc20Protocol";

export const ETHEREUM_BLOCKCHAIN = new Blockchain("Ethereum blockchain", [ERC20]);
