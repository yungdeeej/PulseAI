// Tiny stub that opens port 20643 and proxies it to the Vite dev server on port 5000.
// Required because the locked "apps/web: web" artifact workflow has waitForPort=20643.
const http = require("http");

const TARGET_PORT = 5000;
const STUB_PORT = parseInt(process.env.STUB_PORT || "20643");

const server = http.createServer((req, res) => {
  const options = {
    hostname: "localhost",
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `localhost:${TARGET_PORT}` },
  };
  const proxy = http.request(options, (pr) => {
    res.writeHead(pr.statusCode, pr.headers);
    pr.pipe(res, { end: true });
  });
  proxy.on("error", () => {
    res.writeHead(502);
    res.end("Bad Gateway");
  });
  req.pipe(proxy, { end: true });
});

server.listen(STUB_PORT, "0.0.0.0", () => {
  console.log(`proxy-stub: ${STUB_PORT} → ${TARGET_PORT}`);
});
