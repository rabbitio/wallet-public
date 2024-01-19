import { Erc20Token } from "../models/erc20Token";

/**
 * Guide to add new token:
 * https://www.notion.so/rabbitio/Architecture-3bafd6fc3b2b46619b663a2527a7d869?pvs=4#e525add4d1f34ee4a5b9e886ae2088e1
 */
export const usdtErc20 = new Erc20Token(
    "Tether ERC20",
    "USDT",
    6,
    "0xdac17f958d2ee523a2206206994597c13d831ec7",
    "milli-cent"
);

export const usdcErc20 = new Erc20Token(
    "USD Coin ERC20",
    "USDC",
    6,
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    "milli-cent"
);

export const shibErc20 = new Erc20Token("SHIBA INU ERC20", "SHIB", 18, "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce");
export const busdErc20 = new Erc20Token("Binance USD ERC20", "BUSD", 18, "0x4fabb145d64652a948d72533023f6e7a623c7c53");
export const ftmErc20 = new Erc20Token("Fantom Token ERC20", "FTM", 18, "0x4e15361fd6b4bb609fa63c81a2be19d873717870");
export const maticErc20 = new Erc20Token(
    "Matic Token ERC20",
    "MATIC",
    18,
    "0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0"
);
export const galaErc20 = new Erc20Token("Gala ERC20", "GALA", 8, "0xd1d2eb1b1e90b638588728b4130137d262c87cae");
export const linkErc20 = new Erc20Token(
    "ChainLink Token ERC20",
    "LINK",
    18,
    "0x514910771af9ca656af840dff83e8264ecf986ca"
);
export const agixErc20 = new Erc20Token(
    "SingularityNET Token ERC20",
    "AGIX",
    8,
    "0x5b7533812759b45c2b44c19e320ba2cd2681b542"
);
export const daiErc20 = new Erc20Token("Dai Stablecoin ERC20", "DAI", 18, "0x6b175474e89094c44da98b954eedeac495271d0f");
export const sandErc20 = new Erc20Token("SAND ERC20", "SAND", 18, "0x3845badade8e6dff049820680d1f14bd3903a5d0");
export const wBtcErc20 = new Erc20Token("Wrapped BTC ERC20", "WBTC", 8, "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599");
export const blurErc20 = new Erc20Token("Blur ERC20", "BLUR", 18, "0x5283d291dbcf85356a21ba090e6db59121208b44");
export const grtErc20 = new Erc20Token("Graph Token ERC20", "GRT", 18, "0xc944e90c64b2c07662a292be6244bdf05cda44a7");
export const maskErc20 = new Erc20Token("Mask Network ERC20", "MASK", 18, "0x69af81e73a73b40adf4f3d4223cd9b1ece623074");
export const tusdErc20 = new Erc20Token("TrueUSD ERC20", "TUSD", 18, "0x0000000000085d4780b73119b644ae5ecd22b376");
export const _1InchErc20 = new Erc20Token(
    "1INCH Token ERC20",
    "1INCH",
    18,
    "0x111111111117dc0aa78b770fa6a738034120c302"
);
export const qntErc20 = new Erc20Token("Quant ERC20", "QNT", 18, "0x4a220e6096b25eadb88358cb44068a3248254675");
export const flokiErc20 = new Erc20Token("FLOKI ERC20", "FLOKI", 9, "0xcf0c122c6b73ff809c693db761e7baebe62b6a2e");
export const hexErc20 = new Erc20Token("HEX ERC20", "HEX", 8, "0x2b591e99afe9f32eaa6214f7b7629768c40eeb39");
export const uniErc20 = new Erc20Token("Uniswap ERC20", "UNI", 18, "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984");
export const fetErc20 = new Erc20Token("Fetch ERC20", "FET", 18, "0xaea46a60368a7bd060eec7df8cba43b7ef41ad85");
export const snxErc20 = new Erc20Token(
    "Synthetix Token ERC20",
    "SNX",
    18,
    "0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f"
);
export const sushiErc20 = new Erc20Token("SushiToken ERC20", "SUSHI", 18, "0x6b3595068778dd592e39a122f4f5a5cf09c90fe2");
export const ldoErc20 = new Erc20Token("Lido DAO Token ERC20", "LDO", 18, "0x5a98fcbea516cf06857215779fd812ca3bef1b32");
export const apeErc20 = new Erc20Token("ApeCoin ERC20", "APE", 18, "0x4d224452801aced8b2f0aebe155379bb5d594381");
export const imxErc20 = new Erc20Token("Immutable X ERC20", "IMX", 18, "0xf57e7e7c23978c3caec3c3548e3d615c346e79ff");
export const rndrErc20 = new Erc20Token("Render Token ERC20", "RNDR", 18, "0x6de037ef9ad2725eb40118bb1702ebb27e4aeb24");
export const yfiErc20 = new Erc20Token("yearn.finance ERC20", "YFI", 18, "0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e");
export const cvxErc20 = new Erc20Token("Convex Token ERC20", "CVX", 18, "0x4e3fbd56cd56c3e72c1403e103b45db9da5b9d2b");
// TODO: [bug, moderate] We always use UPPER CASE ticker all over the app but this one is partially lower case. Monitor are there any issues.
export const stethErc20 = new Erc20Token(
    "Lido Staked ETH ERC20",
    "STETH",
    18,
    "0xae7ab96520de3a18e5e111b5eaab095312d7fe84"
);
export const paxgErc20 = new Erc20Token("Paxos Gold ERC20", "PAXG", 18, "0x45804880de22913dafe09f4980848ece6ecbaf78");
export const syncErc20 = new Erc20Token("Synapse ERC20", "SYN", 18, "0x0f2d719407fdbeff09d87557abb7232601fd9f29");
export const fxsErc20 = new Erc20Token("Frax Share ERC20", "FXS", 18, "0x3432b6a60d23ca0dfca7761b7ab56459d9c964d0");
export const lptErc20 = new Erc20Token("Livepeer Token ERC20", "LPT", 18, "0x58b6a8a3302369daec383334672404ee733ab239");
export const balErc20 = new Erc20Token("Balancer ERC20", "BAL", 18, "0xba100000625a3754423978a60c9317c58a424e3d");
export const vraErc20 = new Erc20Token("VERA ERC20", "VRA", 18, "0xf411903cbc70a74d22900a5de66a2dda66507255");
export const stgErc20 = new Erc20Token("StargateToken ERC20", "STG", 18, "0xaf5191b0de278c7286d6c7cc6ab6bb8a73ba2cd6");
export const lrcErc20 = new Erc20Token("LoopringCoin ERC20", "LRC", 18, "0xbbbbca6a901c926f240b89eacb641d8aec7aeafd");
