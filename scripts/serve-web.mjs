import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, request as proxyRequest } from "node:http";
import { extname, join, normalize } from "node:path";

const port = Number(process.env.PORT ?? 10000);
const upstreamHost = process.env.API_UPSTREAM_HOST ?? "api";
const upstreamPort = Number(process.env.API_UPSTREAM_PORT ?? 10000);
const publicDirectory = join(process.cwd(), "apps/web/dist");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".woff2", "font/woff2"]
]);

createServer((request, response) => {
  if (request.url?.startsWith("/api/")) {
    proxyApi(request, response);
    return;
  }

  serveAsset(request.url ?? "/", response);
}).listen(port, "0.0.0.0", () => {
  console.log(`Web listening on http://0.0.0.0:${port}`);
});

function proxyApi(incoming, outgoing) {
  const proxy = proxyRequest(
    {
      host: upstreamHost,
      port: upstreamPort,
      method: incoming.method,
      path: incoming.url,
      headers: { ...incoming.headers, host: `${upstreamHost}:${upstreamPort}` }
    },
    (response) => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    }
  );

  proxy.on("error", (error) => {
    console.error("API proxy failed", error);
    if (!outgoing.headersSent) outgoing.writeHead(502, { "content-type": "application/json" });
    outgoing.end(JSON.stringify({ message: "API temporarily unavailable" }));
  });
  incoming.pipe(proxy);
}

function serveAsset(url, response) {
  const pathname = new URL(url, "http://localhost").pathname;
  const requestedPath = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
  const candidate = join(publicDirectory, requestedPath);
  const filePath = existsSync(candidate) && statSync(candidate).isFile()
    ? candidate
    : join(publicDirectory, "index.html");
  const extension = extname(filePath);

  response.writeHead(200, {
    "content-type": contentTypes.get(extension) ?? "application/octet-stream",
    "cache-control": extension === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff"
  });
  createReadStream(filePath).pipe(response);
}
