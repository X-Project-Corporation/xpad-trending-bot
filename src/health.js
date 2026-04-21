import http from "http";
import { getTrending, getToken } from "./fetcher.js";

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // GET /trending — returns top trending tokens as JSON (for buybot integration)
  if (url.pathname === "/trending") {
    const top = getTrending(20);
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(top.map(t => ({
      address: t.address,
      symbol: t.symbol,
      name: t.name,
      trendingScore: t.trendingScore || 0,
      mcap: t.mcap,
      priceUsd: t.priceUsd,
      volume24h: t.volume24h,
      priceChange1h: t.priceChange1h || 0,
      priceChange24h: t.priceChange24h || 0,
      graduated: t.graduated,
    }))));
    return;
  }

  // GET /is-trending?address=0x... — quick check for buybot
  if (url.pathname === "/is-trending") {
    const addr = url.searchParams.get("address");
    if (!addr) { res.writeHead(400); res.end("Missing address"); return; }
    const top = getTrending(10);
    const found = top.find(t => t.address.toLowerCase() === addr.toLowerCase());
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ trending: !!found, rank: found ? top.indexOf(found) + 1 : null, score: found?.trendingScore || 0 }));
    return;
  }

  res.writeHead(200);
  res.end("OK");
});

server.listen(PORT, () => {
  console.log(`Health check listening on port ${PORT}`);
});

export default server;
