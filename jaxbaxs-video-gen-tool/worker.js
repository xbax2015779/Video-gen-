const V1 = "https://api.vidogrid.ai/uapi/v1";
const V2 = "https://api.vidogrid.ai/uapi/v2";

const MODELS = {
  "veo-3.1": { kind: "video", base: 1, path: "/video-gen/veo", modelField: true },
  "veo-3.1-fast": { kind: "video", base: 1, path: "/video-gen/veo", modelField: true },
  "omni-1.1-flash": { kind: "video", base: 1, path: "/video-gen/veo", modelField: true },
  "grok-imagine-video-1.5": { kind: "video", base: 1, path: "/video-gen/grok-imagine-video-1.5" },
  "grok-imagine-video-1.5-lite": { kind: "video", base: 1, path: "/video-gen/grok-imagine-video-1.5-lite" },
  "muse-ai-video": { kind: "video", base: 1, path: "/video-gen/meta", modelField: true },
  "nano-banana-pro": { kind: "image", base: 1, path: "/generate_image", modelField: true },
  "nano-banana-2.1": { kind: "image", base: 1, path: "/generate_image", modelField: true },
  "nano-banana-2-lite": { kind: "image", base: 1, path: "/generate_image", modelField: true },
  "grok-image": { kind: "image", base: 1, path: "/imagen/grok" },
  "grok-image-v2": { kind: "image", base: 2, path: "/imagen/grok" },
  "gpt-image-2.5": { kind: "image", base: 1, path: "/imagen/gpt-image-2.5" }
};

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS"
};

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "content-type": "application/json; charset=utf-8" }
  });
}

async function callVidoGrid(env, path, method = "GET", body = undefined, version = 1) {
  const base = version === 2 ? V2 : V1;
  const response = await fetch(base + path, {
    method,
    headers: { "x-api-key": env.VIDOGRID_API_KEY, "accept": "application/json" },
    body
  });
  const raw = await response.text();
  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = { raw }; }
  return reply(parsed, response.status);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!env.VIDOGRID_API_KEY || !env.CHATGPT_ACTION_SECRET)
      return reply({ error: "Worker secrets are missing. Configure VIDOGRID_API_KEY and CHATGPT_ACTION_SECRET." }, 500);

    const auth = request.headers.get("authorization") || "";
    if (auth !== `Bearer ${env.CHATGPT_ACTION_SECRET}`)
      return reply({ error: "Unauthorized. The local app must send its bridge secret." }, 401);

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/account")
      return callVidoGrid(env, "/account");

    if (request.method === "GET" && url.pathname === "/histories") {
      const params = new URLSearchParams();
      for (const key of ["filter_by", "items_per_page", "page"]) {
        const value = url.searchParams.get(key);
        if (value) params.set(key, value);
      }
      return callVidoGrid(env, `/histories?${params.toString()}`);
    }

    if (request.method === "GET" && url.pathname.startsWith("/history/")) {
      const uuid = decodeURIComponent(url.pathname.slice("/history/".length));
      if (!uuid || uuid.includes("/")) return reply({ error: "Invalid generation UUID." }, 400);
      return callVidoGrid(env, `/history/${encodeURIComponent(uuid)}`);
    }

    if (request.method === "POST" && url.pathname === "/generate") {
      let form;
      try { form = await request.formData(); }
      catch { return reply({ error: "Expected multipart form data." }, 400); }
      const model = String(form.get("model") || "");
      const config = MODELS[model];
      if (!config) return reply({ error: "Unsupported model.", supported_models: Object.keys(MODELS) }, 400);
      const prompt = String(form.get("prompt") || "").trim();
      if (!prompt) return reply({ error: "Prompt is required." }, 400);

      // Endpoint-specific model selection: only append model where the docs require it.
      if (config.modelField) form.set("model", model);
      else form.delete("model");

      const base = config.base === 2 ? V2 : V1;
      const response = await fetch(base + config.path, {
        method: "POST",
        headers: { "x-api-key": env.VIDOGRID_API_KEY, "accept": "application/json" },
        body: form
      });
      const raw = await response.text();
      let parsed;
      try { parsed = JSON.parse(raw); } catch { parsed = { raw }; }
      return reply(parsed, response.status);
    }

    return reply({ error: "Not found." }, 404);
  }
};
