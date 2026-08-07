export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
export const XPAD_API_URL = process.env.XPAD_API_URL || "https://api.xpad.fun";
export const DATA_DIR = process.env.DATA_DIR || "./data";

// Multi-chain config
export const CHAINS = {
  base: {
    name: "Base",
    chainId: 8453,
    rpc: process.env.BASE_RPC_URL || "https://base-rpc.publicnode.com",
    rpcFallback: "wss://base-rpc.publicnode.com",
    factory: "0xf6efe0Ae024b168cF3d542412d5713C768A38644",
    weth: "0x4200000000000000000000000000000000000006",
    uniswapFactory: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6",
    explorer: "https://basescan.org",
    dexScreenerChain: "base",
    xpadPath: "base",
    pollingInterval: 4000,
  },
  ethereum: {
    name: "Ethereum",
    chainId: 1,
    rpc: process.env.WSS_RPC_URL || "wss://mainnet.infura.io/ws/v3/b59d9f35046c4907a97d27eae87e3845",
    rpcFallback: "wss://ethereum-rpc.publicnode.com",
    factory: process.env.FACTORY_ADDRESS || "0x01Ea841f961aF744eD25E5D6F7cF791aebeaa3F8",
    weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    uniswapFactory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
    explorer: "https://etherscan.io",
    dexScreenerChain: "ethereum",
    xpadPath: "eth",
    pollingInterval: 12000,
  },
  robinhood: {
    name: "Robinhood",
    chainId: 4663,
    // API-only chain: launch alerts + trending come from the backend fetch.
    // Buy alerts on RH are the buybot's job (its getLogs poller); this bot's
    // WSS Uniswap listener doesn't work on RH's RPC, so it skips this chain.
    listenerEnabled: false,
    rpc: null,
    rpcFallback: null,
    factory: null,
    weth: null,
    uniswapFactory: null,
    explorer: "https://robinhood.blockscout.com",
    dexScreenerChain: "robinhood",
    xpadPath: "robinhood",
    pollingInterval: 0,
  },
  arbitrum: {
    name: "Arbitrum",
    chainId: 42161,
    // API-only, same rationale as Robinhood: xpad launches here are single-sided V3
    // (PumpFactoryV3Fee, 0.3% tier) with no bonding curve and no V2 graduation, so there is
    // no PairCreated for the WSS listener to watch. Launch alerts + trending come from the
    // backend fetch; buy alerts are the buybot's job (it polls this chain's V3 pools).
    listenerEnabled: false,
    rpc: null,
    rpcFallback: null,
    factory: null,
    weth: null,
    uniswapFactory: null,
    explorer: "https://arbiscan.io",
    dexScreenerChain: "arbitrum",
    xpadPath: "arbitrum",
    pollingInterval: 0,
  },
};

// Backwards compat exports for listener.js
export const WSS_RPC_URL = CHAINS.ethereum.rpc;
export const WSS_RPC_FALLBACK = CHAINS.ethereum.rpcFallback;
export const FACTORY_ADDRESS = CHAINS.ethereum.factory;

if (!TELEGRAM_BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is required");
  process.exit(1);
}

console.log(`[config] Multi-chain: ${Object.keys(CHAINS).join(" + ")}`);

