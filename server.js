import http from "http";
import https from "https";
import { URL } from "url";

const PORT = process.env.PORT || 3000;
const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

const STRIP_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

const server = http.createServer((req, res) => {
  if (!TARGET_BASE) {
    res.writeHead(500);
    return res.end("TARGET_DOMAIN not set");
  }

  try {
    const targetUrl = new URL(TARGET_BASE + req.url);
    const isHttps = targetUrl.protocol === "https:";
    const client = isHttps ? https : http;

    let clientIp = null;
    const headers = {};

    for (const [key, value] of Object.entries(req.headers)) {
      const k = key.toLowerCase();

      if (STRIP_HEADERS.has(k)) continue;
      if (k.startsWith("x-render-")) continue;

      if (k === "x-real-ip") {
        clientIp = value;
        continue;
      }

      if (k === "x-forwarded-for") {
        if (!clientIp) clientIp = value;
        continue;
      }

      headers[k] = value;
    }

    if (clientIp) headers["x-forwarded-for"] = clientIp;

    const options = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: targetUrl.pathname + targetUrl.search,
      method: req.method,
      headers,
    };

    const proxyReq = client.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on("error", (err) => {
      console.error("Proxy error:", err);
      res.writeHead(502);
      res.end("Bad Gateway");
    });

    // 🔥 CRITICAL: stream request directly (no buffering)
    req.pipe(proxyReq);

  } catch (err) {
    console.error(err);
    res.writeHead(500);
    res.end("Internal Error");
  }
});

server.listen(PORT, () => {
  console.log(`Relay running on port ${PORT}`);
});
