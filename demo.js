#!/usr/bin/env node
/*
 * Shipyard demo runner — zero dependencies, zero config.
 *
 *   node demo.js
 *
 * Serves the simulated product (home → buy → wizard) as a static site and opens
 * your browser. No accounts, no license, no build step. Everything is a
 * pretend/simulated version so you can walk people through the whole experience.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const ROOT = path.join(__dirname, "dashboard");
const PORT = process.env.PORT || 3939;
const DEFAULT = "home.html";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/" || urlPath === "") urlPath = "/" + DEFAULT;

  // Resolve safely inside ROOT (no path traversal).
  const filePath = path.join(ROOT, path.normalize(urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/html" });
      res.end(
        `<body style="font-family:sans-serif;background:#0b0e14;color:#e6e9f0;padding:40px">
         <h2>Not found</h2><p>Try <a style="color:#60a5fa" href="/">the homepage</a>.</p></body>`
      );
      return;
    }
    const type = TYPES[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}/`;
  console.log(`\n  🏄 ShipSurfer demo running\n`);
  console.log(`     ${url}\n`);
  console.log(`  Pages:`);
  console.log(`     ${url}              home / landing`);
  console.log(`     ${url}onboarding.html  payment → setup wizard`);
  console.log(`     ${url}wizard.html      setup wizard only\n`);
  console.log(`  This is the simulated (pretend) version — nothing is real.`);
  console.log(`  Press Ctrl+C to stop.\n`);

  const opener =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
      ? "start"
      : "xdg-open";
  exec(`${opener} ${url}`, () => {});
});
