// Tiny stub that opens port 20643 and proxies it to the Vite dev server on port 5000.
// Required because the locked "apps/web: web" artifact workflow has waitForPort=20643.
// Supports both HTTP requests and WebSocket upgrades (needed for Vite HMR).
const http = require("http");
const net = require("net");

const TARGET_PORT = 5000;
const TARGET_HOST = "localhost";
const STUB_PORT = parseInt(process.env.STUB_PORT || "20643");

const server = http.createServer((req, res) => {
  const proxy = http.request(
    {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `${TARGET_HOST}:${TARGET_PORT}` },
    },
    (pr) => {
      res.writeHead(pr.statusCode, pr.headers);
      pr.pipe(res, { end: true });
    },
  );
  proxy.on("error", () => {
    if (!res.headersSent) res.writeHead(502);
    res.end("Bad Gateway");
  });
  req.pipe(proxy, { end: true });
});

server.on("upgrade", (req, clientSocket, head) => {
  const upstream = net.connect(TARGET_PORT, TARGET_HOST, () => {
    const headerLines = [
      `${req.method} ${req.url} HTTP/${req.httpVersion}`,
    ];
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) {
        for (const item of v) headerLines.push(`${k}: ${item}`);
      } else {
        headerLines.push(`${k}: ${v}`);
      }
    }
    upstream.write(headerLines.join("\r\n") + "\r\n\r\n");
    if (head && head.length) upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
  const cleanup = () => {
    try { upstream.destroy(); } catch {}
    try { clientSocket.destroy(); } catch {}
  };
  upstream.on("error", cleanup);
  clientSocket.on("error", cleanup);
});

server.listen(STUB_PORT, "0.0.0.0", () => {
  console.log(`proxy-stub: ${STUB_PORT} → ${TARGET_PORT} (HTTP + WS)`);
});

// Exit cleanly if Vite (parent shell pipeline) dies
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
