import http from "http";

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("OK");
});

server.listen(PORT, () => {
  console.log(`Health check listening on port ${PORT}`);
});

export default server;
