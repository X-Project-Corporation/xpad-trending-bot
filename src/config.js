export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
export const XPAD_API_URL = process.env.XPAD_API_URL || "https://api.xpad.fun";
export const DATA_DIR = process.env.DATA_DIR || "./data";
export const WSS_RPC_URL = process.env.WSS_RPC_URL || "wss://mainnet.infura.io/ws/v3/b59d9f35046c4907a97d27eae87e3845";
export const WSS_RPC_FALLBACK = "wss://ethereum-rpc.publicnode.com";
export const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS || "0x01Ea841f961aF744eD25E5D6F7cF791aebeaa3F8";

if (!TELEGRAM_BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is required");
  process.exit(1);
}
