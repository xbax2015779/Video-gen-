const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

function loadEnv() {
  const p = path.join(__dirname, ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const PORT = Number(process.env.PORT || 3000);
const WORKER_URL = (process.env.WORKER_URL || "").replace(/\/+$/, "");
const BRIDGE_SECRET = process.env.CHATGPT_ACTION_SECRET || "";
const APP_USERNAME = process.env.APP_USERNAME || "family";
const APP_PASSWORD = process.env.APP_PASSWORD || "";
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const FAMILY_DATA_FILE = path.join(DATA_DIR, "family-data.json");

function readFamilyData() {
  try { return JSON.parse(fs.readFileSync(FAMILY_DATA_FILE, "utf8")); }
  catch { return { jobs: [] }; }
}
function writeFamilyData(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FAMILY_DATA_FILE, JSON.stringify(data, null, 2));
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon"
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "x-content-type-options": "nosniff" });
  res.end(body);
}

async function proxy(req, res, targetPath, method = "GET", body = undefined, contentType = undefined) {
  if (!WORKER_URL || !BRIDGE_SECRET) {
    return send(res, 500, JSON.stringify({ error: "Set WORKER_URL and CHATGPT_ACTION_SECRET in your .env file." }));
  }
  try {
    const headers = { "authorization": `Bearer ${BRIDGE_SECRET}`, "accept": "application/json" };
    if (contentType) headers["content-type"] = contentType;
    const upstream = await fetch(WORKER_URL + targetPath, { method, headers, body });
    const text = await upstream.text();
    send(res, upstream.status, text);
  } catch (e) {
    send(res, 502, JSON.stringify({ error: "Could not reach the Cloudflare Worker.", detail: e.message }));
  }
}

const server = http.createServer(async (req, res) => {
  // Require a shared family login so other devices on the Wi-Fi cannot use API credits anonymously.
  if (!APP_PASSWORD) {
    return send(res, 500, JSON.stringify({ error: "Set APP_PASSWORD in your .env file before starting the server." }));
  }
  const auth = req.headers.authorization || "";
  let authorized = false;
  if (auth.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
      const splitAt = decoded.indexOf(":");
      const username = splitAt >= 0 ? decoded.slice(0, splitAt) : "";
      const password = splitAt >= 0 ? decoded.slice(splitAt + 1) : "";
      const a = Buffer.from(username), b = Buffer.from(APP_USERNAME);
      const c = Buffer.from(password), d = Buffer.from(APP_PASSWORD);
      authorized = a.length === b.length && c.length === d.length &&
        require("node:crypto").timingSafeEqual(a, b) && require("node:crypto").timingSafeEqual(c, d);
    } catch (_) { authorized = false; }
  }
  if (!authorized) {
    res.writeHead(401, { "www-authenticate": 'Basic realm="Jaxbax Video Gen Tool"', "cache-control": "no-store" });
    return res.end("Family login required.");
  }
  const u = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && u.pathname === "/api/family-data") {
    const data = readFamilyData();
    return send(res, 200, JSON.stringify({ jobs: data.jobs }));
  }

  if (req.method === "POST" && u.pathname === "/api/family-data") {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      const data = readFamilyData();
      if (payload.action === "addJob") {
        const { uuid, prompt, kind, model } = payload;
        if (!uuid || !["video", "image"].includes(kind) || !model)
          return send(res, 400, JSON.stringify({ error: "Invalid generation record." }));
        if (!data.jobs.some(j => j.uuid === uuid)) data.jobs.unshift({ uuid, prompt: String(prompt || "").slice(0, 3000), kind, model, createdAt: new Date().toISOString(), status: "Queued" });
        data.jobs = data.jobs.slice(0, 500);
        writeFamilyData(data);
        return send(res, 200, JSON.stringify({ ok: true }));
      }
      return send(res, 400, JSON.stringify({ error: "Unknown queue action." }));
    } catch (e) {
      return send(res, 400, JSON.stringify({ error: "Invalid family-data JSON.", detail: e.message }));
    }
  }

  if (req.method === "GET" && u.pathname === "/api/account")
    return proxy(req, res, "/account");

  if (req.method === "GET" && u.pathname === "/api/histories") {
    const q = new URLSearchParams(u.searchParams);
    return proxy(req, res, `/histories?${q.toString()}`);
  }

  if (req.method === "GET" && u.pathname.startsWith("/api/history/")) {
    const uuid = decodeURIComponent(u.pathname.slice("/api/history/".length));
    return proxy(req, res, `/history/${encodeURIComponent(uuid)}`);
  }

  if (req.method === "POST" && u.pathname === "/api/generate") {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      // The browser's multipart boundary is preserved end-to-end.
      return proxy(req, res, "/generate", "POST", body, req.headers["content-type"]);
    } catch (e) {
      return send(res, 400, JSON.stringify({ error: "Could not read generation request.", detail: e.message }));
    }
  }

  if (req.method === "GET") {
    const relative = u.pathname === "/" ? "index.html" : decodeURIComponent(u.pathname.slice(1));
    const file = path.resolve(PUBLIC_DIR, relative);
    if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== path.join(PUBLIC_DIR, "index.html"))
      return send(res, 403, "Forbidden", "text/plain; charset=utf-8");
    fs.readFile(file, (err, data) => {
      if (err) return send(res, 404, "Not found", "text/plain; charset=utf-8");
      send(res, 200, data, MIME[path.extname(file)] || "application/octet-stream");
    });
    return;
  }

  send(res, 404, JSON.stringify({ error: "Not found." }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Jaxbax's Video Gen Tool is running at http://localhost:${PORT}`);
  console.log(`It is also available to devices on your home Wi-Fi at http://YOUR-PC-IP:${PORT}`);
  console.log("Keep this terminal open while using the generator.");
});
