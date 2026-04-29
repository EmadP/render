import express from "express";
import fetch from "node-fetch";

const app = express();
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

app.use(express.raw({ type: "*/*" }));

app.all("*", async (req, res) => {
  if (!TARGET_BASE) {
    return res.status(500).send("TARGET_DOMAIN not set");
  }

  try {
    const targetUrl = TARGET_BASE + req.originalUrl;

    const headers = {};
    let clientIp = null;

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

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
      redirect: "manual",
    });

    res.status(upstream.status);

    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === "transfer-encoding") return;
      res.setHeader(key, value);
    });

    upstream.body.pipe(res);

  } catch (err) {
    res.status(502).send("Bad Gateway");
  }
});

app.listen(PORT, () => {
  console.log(`Relay running on port ${PORT}`);
});
