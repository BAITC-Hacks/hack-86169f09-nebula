import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import apiHandler from "./api/match.js";

const root = process.cwd();
const port = Number(process.env.PORT || 3000);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function createApiResponse(response) {
  response.status = (statusCode) => {
    response.statusCode = statusCode;
    return response;
  };
  response.json = (body) => {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify(body));
  };
  return response;
}

createServer(async (request, response) => {
  const requestUrl = new URL(request.url, "http://localhost:" + port);

  if (requestUrl.pathname === "/api/match") {
    request.query = Object.fromEntries(requestUrl.searchParams);
    await apiHandler(request, createApiResponse(response));
    return;
  }

  const relativePath = requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.slice(1);
  const assetPath = resolve(root, normalize(relativePath));
  if (!assetPath.startsWith(root + "\\") && assetPath !== join(root, "index.html")) {
    response.statusCode = 403;
    response.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(assetPath);
    response.statusCode = 200;
    response.setHeader("Content-Type", mimeTypes[extname(assetPath)] || "application/octet-stream");
    response.end(content);
  } catch {
    response.statusCode = 404;
    response.end("Not found");
  }
}).listen(port, () => {
  console.log("EventMatch AI открыт: http://localhost:" + port);
});