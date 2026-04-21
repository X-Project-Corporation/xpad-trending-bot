import { ethers } from "ethers";
import { WSS_RPC_URL, WSS_RPC_FALLBACK, FACTORY_ADDRESS } from "./config.js";
import { getToken, getAllTokens } from "./fetcher.js";

const TRADE_ABI = [
  "event Trade(address indexed mint, uint256 ethAmount, uint256 tokenAmount, bool isBuy, address indexed user, uint256 timestamp, uint256 virtualEthReserves, uint256 virtualTokenReserves, uint256 totalSupply)",
];

const UNISWAP_PAIR_ABI = [
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
];

const UNISWAP_FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) view returns (address)",
];

const ERC20_ABI = [
  "function symbol() view returns (string)",
];

const UNISWAP_V2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

let provider = null;
let factoryContract = null;
let pairListeners = new Map(); // tokenAddr -> { pair, contract }
let ethPrice = 0;
let sendFn = null;
let isReconnecting = false;
let reconnectAttempts = 0;
let usingFallback = false;
const MAX_RECONNECT_DELAY = 60_000;

// Symbol cache to avoid repeated RPC calls
const symbolCache = new Map();

async function getTokenSymbol(tokenAddress) {
  const key = tokenAddress.toLowerCase();
  if (symbolCache.has(key)) return symbolCache.get(key);
  // Check fetcher data first
  const fetched = getToken(key);
  if (fetched && fetched.symbol && fetched.symbol !== "???") {
    symbolCache.set(key, fetched.symbol);
    return fetched.symbol;
  }
  try {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const symbol = await contract.symbol();
    symbolCache.set(key, symbol);
    return symbol;
  } catch {
    return "???";
  }
}

// ─── ETH price ──────────────────────────────────────────────────

async function refreshEthPrice() {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
    const json = await res.json();
    ethPrice = json?.ethereum?.usd || ethPrice;
  } catch {}
}

// ─── Market cap helpers ─────────────────────────────────────────

function calcBondingMcap(virtualEthReserves, virtualTokenReserves, totalSupply) {
  const vEth = parseFloat(ethers.formatEther(virtualEthReserves));
  const vTok = parseFloat(ethers.formatEther(virtualTokenReserves));
  if (vTok === 0) return 0;
  const priceInEth = vEth / vTok;
  const supply = parseFloat(ethers.formatEther(totalSupply));
  return priceInEth * supply * ethPrice;
}

function calcGraduatedMcap(ethAmount, tokenAmount) {
  const ethFloat = parseFloat(ethers.formatEther(ethAmount));
  const tokFloat = parseFloat(ethers.formatEther(tokenAmount));
  if (tokFloat === 0) return 0;
  const pricePerToken = ethFloat / tokFloat;
  return pricePerToken * 1_000_000_000 * ethPrice; // 1B supply
}

// ─── Trade handler (bonding curve buys) ─────────────────────────

async function onTrade(mint, ethAmount, tokenAmount, isBuy, user, timestamp, virtualEthReserves, virtualTokenReserves, totalSupply, event) {
  if (!isBuy) return; // Only post buys

  const ethFloat = parseFloat(ethers.formatEther(ethAmount));
  const usdAmount = ethFloat * ethPrice;
  const symbol = await getTokenSymbol(mint);
  const mcap = calcBondingMcap(virtualEthReserves, virtualTokenReserves, totalSupply);

  // Get bonding progress and volume from fetcher
  const tokenData = getToken(mint.toLowerCase());
  const bondingProgress = tokenData?.bondingProgress || 0;
  const volume24h = tokenData?.volume24h || 0;

  const txHash = event?.log?.transactionHash || null;

  if (sendFn) {
    sendFn({
      symbol,
      tokenAddress: mint,
      ethAmount: ethFloat,
      usdAmount,
      mcap,
      volume24h,
      buyer: user,
      txHash,
      bondingProgress,
      graduated: false,
    });
  }
}

// ─── Uniswap swap handler (graduated token buys) ────────────────

async function onUniswapSwap(tokenAddress, tokenSymbol, sender, amount0In, amount1In, amount0Out, amount1Out, to) {
  const isToken0Weth = WETH.toLowerCase() < tokenAddress.toLowerCase();
  let ethIn, tokensOut;

  if (isToken0Weth) {
    ethIn = amount0In;
    tokensOut = amount1Out;
  } else {
    ethIn = amount1In;
    tokensOut = amount0Out;
  }

  // Only post buys (ETH in)
  if (ethIn === 0n) return;

  const ethFloat = parseFloat(ethers.formatEther(ethIn));
  const usdAmount = ethFloat * ethPrice;
  const mcap = calcGraduatedMcap(ethIn, tokensOut);

  const tokenData = getToken(tokenAddress.toLowerCase());
  const volume24h = tokenData?.volume24h || 0;

  if (sendFn) {
    sendFn({
      symbol: tokenSymbol,
      tokenAddress,
      ethAmount: ethFloat,
      usdAmount,
      mcap,
      volume24h,
      buyer: to,
      txHash: null,
      bondingProgress: 0,
      graduated: true,
    });
  }
}

// ─── Subscribe to Uniswap pairs for graduated tokens ────────────

async function subscribeToUniswapPair(tokenAddress) {
  const addr = tokenAddress.toLowerCase();
  if (pairListeners.has(addr)) return;

  try {
    const uniFactory = new ethers.Contract(UNISWAP_V2_FACTORY, UNISWAP_FACTORY_ABI, provider);
    const pairAddress = await uniFactory.getPair(tokenAddress, WETH);
    if (!pairAddress || pairAddress === ethers.ZeroAddress) return;

    const tokenSymbol = await getTokenSymbol(tokenAddress);
    const pairContract = new ethers.Contract(pairAddress, UNISWAP_PAIR_ABI, provider);

    pairContract.on("Swap", (senderAddr, a0In, a1In, a0Out, a1Out, toAddr) => {
      onUniswapSwap(tokenAddress, tokenSymbol, senderAddr, a0In, a1In, a0Out, a1Out, toAddr).catch((err) => {
        console.error("Uniswap swap handler error:", err.message?.slice(0, 100));
      });
    });

    pairListeners.set(addr, { pair: pairAddress, contract: pairContract });
    console.log(`Listening for Uniswap swaps: ${tokenSymbol} (${addr.slice(0, 10)}...)`);
  } catch (err) {
    // Silently skip — many tokens won't have a Uniswap pair
  }
}

async function subscribeAllGraduatedPairs() {
  const allTokens = getAllTokens();
  const graduated = allTokens.filter((t) => t.status === "graduated" && t.address);
  for (const token of graduated) {
    await subscribeToUniswapPair(token.address);
  }
  if (graduated.length > 0) {
    console.log(`Subscribed to ${pairListeners.size} Uniswap pairs`);
  }
}

// ─── WebSocket connection with reconnect ────────────────────────

function getRpcUrl() {
  return usingFallback ? WSS_RPC_FALLBACK : WSS_RPC_URL;
}

function subscribe() {
  try {
    const rpcUrl = getRpcUrl();
    provider = new ethers.WebSocketProvider(rpcUrl);

    factoryContract = new ethers.Contract(FACTORY_ADDRESS, TRADE_ABI, provider);
    factoryContract.on("Trade", (...args) => {
      onTrade(...args).catch((err) => {
        console.error("Trade handler error:", err.message?.slice(0, 100));
      });
    });
    console.log(`Listener connected to ${rpcUrl.includes("infura") ? "Infura" : "PublicNode"} | Factory ${FACTORY_ADDRESS.slice(0, 10)}...`);

    // Subscribe to graduated token pairs after a delay (let fetcher populate first)
    setTimeout(() => subscribeAllGraduatedPairs(), 10_000);

    // Re-check for new graduated pairs every 5 minutes
    setInterval(() => subscribeAllGraduatedPairs(), 5 * 60_000);

    let errorHandled = false;
    provider.on("error", (err) => {
      if (errorHandled) return;
      errorHandled = true;
      console.error("Provider error:", err.message?.slice(0, 100));
      reconnect();
    });

    if (provider.websocket) {
      provider.websocket.on("close", () => {
        if (errorHandled) return;
        errorHandled = true;
        console.warn("WebSocket closed");
        reconnect();
      });
    }

    // Reset on successful connection
    reconnectAttempts = 0;
    isReconnecting = false;
  } catch (err) {
    console.error("Subscribe failed:", err.message?.slice(0, 100));
    reconnect();
  }
}

function reconnect() {
  if (isReconnecting) return;
  isReconnecting = true;

  cleanup();

  reconnectAttempts++;

  // After 3 failed attempts on primary, switch to fallback
  if (reconnectAttempts === 4 && !usingFallback) {
    usingFallback = true;
    reconnectAttempts = 1;
    console.log("Switching to fallback RPC...");
  }
  // After 3 failed attempts on fallback, switch back to primary
  if (reconnectAttempts === 4 && usingFallback) {
    usingFallback = false;
    reconnectAttempts = 1;
    console.log("Switching back to primary RPC...");
  }

  const delay = Math.min(5000 * Math.pow(2, reconnectAttempts - 1), MAX_RECONNECT_DELAY);
  console.log(`Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts})...`);

  setTimeout(() => {
    isReconnecting = false;
    subscribe();
  }, delay);
}

function cleanup() {
  try {
    if (factoryContract) factoryContract.removeAllListeners();
    for (const { contract } of pairListeners.values()) {
      try { contract.removeAllListeners(); } catch {}
    }
    if (provider) {
      provider.removeAllListeners();
      if (provider.destroy) provider.destroy();
    }
  } catch {}
  factoryContract = null;
  pairListeners.clear();
  provider = null;
}

// ─── Public API ─────────────────────────────────────────────────

export function startListener(onBuy) {
  sendFn = onBuy;

  refreshEthPrice();
  setInterval(refreshEthPrice, 60_000);

  subscribe();
}

export function getEthPrice() {
  return ethPrice;
}
