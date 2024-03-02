import { Blockchain } from "../common/models/blockchain.js";
import { ERC20 } from "../erc20token/erc20Protocol.js";

export const ETHEREUM_BLOCKCHAIN = new Blockchain("Ethereum blockchain", [ERC20]);
