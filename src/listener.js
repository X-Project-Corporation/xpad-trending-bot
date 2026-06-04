import { ethers } from "ethers";
import { CHAINS } from "./config.js";
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

// Per-chain state
const chainState = new Map(); // chainKey -> { provider, factoryContract, pairListeners, usingFallback, reconnectAttempts, isReconnecting }
let ethPrice = 0;
let sendFn = null;
const MAX_RECONNECT_DELAY = 60_000;

const symbolCache = new Map();

async function getTokenSymbol(tokenAddress, chainKey) {
  const key = `${chainKey}:${tokenAddress.toLowerCase()}`;
  if (symbolCache.has(key)) return symbolCache.get(key);
  const fetched = getToken(tokenAddress.toLowerCase());
  if (fetched && fetched.symbol && fetched.symbol !== "???") {
    symbolCache.set(key, fetched.symbol);
    return fetched.symbol;
  }
  try {
    const state = chainState.get(chainKey);
    if (!state?.provider) return "???";
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, state.provider);
    const symbol = await contract.symbol();
    symbolCache.set(key, symbol);
    return symbol;
  } catch {
    return "???";
  }
}

async function refreshEthPrice() {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
    const json = await res.json();
    ethPrice = json?.ethereum?.usd || ethPrice;
  } catch {}
}

function calcBondingMcap(virtualEthReserves, virtualTokenReserves, totalSupply) {
  const vEth = parseFloat(ethers.formatEther(virtualEthReserves));
  const vTok = parseFloat(ethers.formatEther(virtualTokenReserves));
  if (vTok === 0) return 0;
  return (vEth / vTok) * parseFloat(ethers.formatEther(totalSupply)) * ethPrice;
}

function calcGraduatedMcap(ethAmount, tokenAmount) {
  const ethFloat = parseFloat(ethers.formatEther(ethAmount));
  const tokFloat = parseFloat(ethers.formatEther(tokenAmount));
  if (tokFloat === 0) return 0;
  return (ethFloat / tokFloat) * 1_000_000_000 * ethPrice;
}

// Trade handler factory
function makeOnTrade(chainKey) {
  return async function onTrade(mint, ethAmount, tokenAmount, isBuy, user, timestamp, virtualEthReserves, virtualTokenReserves, totalSupply, event) {
    if (!isBuy) return;
    const ethFloat = parseFloat(ethers.formatEther(ethAmount));
    const usdAmount = ethFloat * ethPrice;
    const symbol = await getTokenSymbol(mint, chainKey);
    const mcap = calcBondingMcap(virtualEthReserves, virtualTokenReserves, totalSupply);
    const tokenData = getToken(mint.toLowerCase());
    const txHash = event?.log?.transactionHash || null;

    if (sendFn) {
      sendFn({
        symbol,
        tokenAddress: mint,
        ethAmount: ethFloat,
        usdAmount,
        mcap,
        volume24h: tokenData?.volume24h || 0,
        buyer: user,
        txHash,
        bondingProgress: tokenData?.bondingProgress || 0,
        graduated: false,
        chainKey,
      });
    }
  };
}

function makeOnUniswapSwap(chainKey) {
  const config = CHAINS[chainKey];
  return async function onUniswapSwap(tokenAddress, tokenSymbol, sender, amount0In, amount1In, amount0Out, amount1Out, to) {
    const isToken0Weth = config.weth.toLowerCase() < tokenAddress.toLowerCase();
    let ethIn, tokensOut;
    if (isToken0Weth) { ethIn = amount0In; tokensOut = amount1Out; }
    else { ethIn = amount1In; tokensOut = amount0Out; }
    if (ethIn === 0n) return;

    const ethFloat = parseFloat(ethers.formatEther(ethIn));
    const tokenData = getToken(tokenAddress.toLowerCase());

    if (sendFn) {
      sendFn({
        symbol: tokenSymbol,
        tokenAddress,
        ethAmount: ethFloat,
        usdAmount: ethFloat * ethPrice,
        mcap: calcGraduatedMcap(ethIn, tokensOut),
        volume24h: tokenData?.volume24h || 0,
        buyer: to,
        txHash: null,
        bondingProgress: 0,
        graduated: true,
        chainKey,
      });
    }
  };
}

async function subscribeToUniswapPair(tokenAddress, chainKey) {
  const state = chainState.get(chainKey);
  if (!state) return;
  const addr = tokenAddress.toLowerCase();
  const pairKey = `${chainKey}:${addr}`;
  if (state.pairListeners.has(pairKey)) return;

  const config = CHAINS[chainKey];
  try {
    const uniFactory = new ethers.Contract(config.uniswapFactory, UNISWAP_FACTORY_ABI, state.provider);
    const pairAddress = await uniFactory.getPair(tokenAddress, config.weth);
    if (!pairAddress || pairAddress === ethers.ZeroAddress) return;

    const tokenSymbol = await getTokenSymbol(tokenAddress, chainKey);
    const onSwap = makeOnUniswapSwap(chainKey);
    const pairContract = new ethers.Contract(pairAddress, UNISWAP_PAIR_ABI, state.provider);
    pairContract.on("Swap", (senderAddr, a0In, a1In, a0Out, a1Out, toAddr) => {
      onSwap(tokenAddress, tokenSymbol, senderAddr, a0In, a1In, a0Out, a1Out, toAddr).catch(() => {});
    });
    state.pairListeners.set(pairKey, { pair: pairAddress, contract: pairContract });
    console.log(`[${chainKey}] Listening Uniswap: ${tokenSymbol} (${addr.slice(0, 10)}...)`);
  } catch {}
}

async function subscribeAllGraduatedPairs(chainKey) {
  const allTokens = getAllTokens();
  const graduated = allTokens.filter((t) => t.status === "graduated" && t.address && (t.chainKey || "ethereum") === chainKey);
  for (const token of graduated) {
    await subscribeToUniswapPair(token.address, chainKey);
  }
  const state = chainState.get(chainKey);
  if (graduated.length > 0 && state) {
    console.log(`[${chainKey}] Subscribed to ${state.pairListeners.size} Uniswap pairs`);
  }
}

function subscribeChain(chainKey) {
  const config = CHAINS[chainKey];
  if (!config) return;

  try {
    let provider;
    if (config.rpc.startsWith("ws")) {
      provider = new ethers.WebSocketProvider(config.rpc);
    } else {
      provider = new ethers.JsonRpcProvider(config.rpc, undefined, {
        polling: true,
        pollingInterval: config.pollingInterval,
      });
    }

    const factoryContract = new ethers.Contract(config.factory, TRADE_ABI, provider);
    const onTrade = makeOnTrade(chainKey);
    factoryContract.on("Trade", (...args) => {
      onTrade(...args).catch((err) => {
        console.error(`[${chainKey}] Trade handler error:`, err.message?.slice(0, 100));
      });
    });
    console.log(`[${chainKey}] Listening for Trade events on ${config.factory.slice(0, 10)}...`);

    const state = {
      provider,
      factoryContract,
      pairListeners: new Map(),
      usingFallback: false,
      reconnectAttempts: 0,
      isReconnecting: false,
    };
    chainState.set(chainKey, state);

    setTimeout(() => subscribeAllGraduatedPairs(chainKey), 10_000);
    setInterval(() => subscribeAllGraduatedPairs(chainKey), 5 * 60_000);

    let errorHandled = false;
    provider.on("error", (err) => {
      if (errorHandled) return;
      errorHandled = true;
      console.error(`[${chainKey}] Provider error:`, err.message?.slice(0, 100));
      reconnectChain(chainKey);
    });
    if (provider.websocket) {
      provider.websocket.on("close", () => {
        if (errorHandled) return;
        errorHandled = true;
        console.warn(`[${chainKey}] WebSocket closed`);
        reconnectChain(chainKey);
      });
    }
  } catch (err) {
    console.error(`[${chainKey}] Subscribe failed:`, err.message?.slice(0, 100));
    reconnectChain(chainKey);
  }
}

function reconnectChain(chainKey) {
  const state = chainState.get(chainKey);
  if (state?.isReconnecting) return;

  // Cleanup
  if (state) {
    state.isReconnecting = true;
    try {
      if (state.factoryContract) state.factoryContract.removeAllListeners();
      for (const { contract } of state.pairListeners.values()) {
        try { contract.removeAllListeners(); } catch {}
      }
      if (state.provider) {
        state.provider.removeAllListeners();
        if (state.provider.destroy) state.provider.destroy();
      }
    } catch {}
    state.reconnectAttempts = (state.reconnectAttempts || 0) + 1;

    // Switch to fallback after 3 failures
    const config = CHAINS[chainKey];
    if (state.reconnectAttempts === 4 && !state.usingFallback && config.rpcFallback) {
      state.usingFallback = true;
      state.reconnectAttempts = 1;
      console.log(`[${chainKey}] Switching to fallback RPC`);
    } else if (state.reconnectAttempts === 4 && state.usingFallback) {
      state.usingFallback = false;
      state.reconnectAttempts = 1;
      console.log(`[${chainKey}] Switching back to primary RPC`);
    }
  }

  const attempts = state?.reconnectAttempts || 1;
  const delay = Math.min(5000 * Math.pow(2, attempts - 1), MAX_RECONNECT_DELAY);
  console.log(`[${chainKey}] Reconnecting in ${delay / 1000}s (attempt ${attempts})...`);

  setTimeout(() => {
    chainState.delete(chainKey);
    subscribeChain(chainKey);
  }, delay);
}

export function startListener(onBuy) {
  sendFn = onBuy;
  refreshEthPrice();
  setInterval(refreshEthPrice, 60_000);

  // Subscribe to ALL chains
  for (const chainKey of Object.keys(CHAINS)) {
    subscribeChain(chainKey);
  }
}

export function getEthPrice() {
  return ethPrice;
}
