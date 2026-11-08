const V1 = "https://api.vidogrid.ai/uapi/v1";
const V2 = "https://api.vidogrid.ai/uapi/v2";

const MODELS = {
  "veo-3.1": {
    type: "video",
    path: "/video-gen/veo",
    modelField: true
  },
  "veo-3.1-fast": {
    type: "video",
    path: "/video-gen/veo",
    modelField: true
  },
  "omni-1.1-flash": {
    type: "video",
    path: "/video-gen/veo",
    modelField: true
  },
  "grok-imagine-video-1.5": {
    type: "video",
    path: "/video-gen/grok-imagine-video-1.5"
  },
  "grok-imagine-video-1.5-lite": {
    type: "video",
    path: "/video-gen/grok-imagine-video-1.5-lite"
  },
  "muse-ai-video": {
    type: "video",
    path: "/video-gen/meta",
    modelField: true
  },
  "nano-banana-pro": {
    type: "image",
    path: "/generate_image",
    modelField: true
  },
  "nano-banana-2.1": {
    type: "image",
    path: "/generate_image",
    modelField: true
  },
  "nano-banana-2-lite": {
    type: "image",
    path: "/generate_image",
    modelField: true
  },
  "grok-image": {
    type: "image",
    path: "/imagen/grok"
  },
  "grok-image-v2": {
    type: "image",
    path: "/imagen/grok",
    version: 2
  },
  "gpt-image-2.5": {
    type: "image",
    path: "/imagen/gpt-image-2.5"
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

// Protect the website and API using your existing Cloudflare secret.
// Username: jaxbax
// Password: your CHATGPT_ACTION_SECRET
function isAuthorized(request, env) {
  const password = env.CHATGPT_ACTION_SECRET;

  if (!password) return false;

  const expected =
    "Basic " + btoa("jaxbax:" + password);

  return request.headers.get("Authorization") === expected;
}

async function callVidoGrid(url, options, env) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      "x-api-key": env.VIDOGRID_API_KEY
    }
  });

  const body = await response.text();

  return new Response(body, {
    status: response.status,
    headers: {
      "Content-Type":
        response.headers.get("Content-Type") || "application/json",
      "Cache-Control": "no-store"
    }
  });
}

async function getJobs(env) {
  const listed = await env.JOBS.list({ prefix: "job:" });

  const jobs = await Promise.all(
    listed.keys.map(async (key) => {
      const value = await env.JOBS.get(key.name);

      if (!value) return null;

      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    })
  );

  return jobs
    .filter(Boolean)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (!env.VIDOGRID_API_KEY || !env.CHATGPT_ACTION_SECRET) {
    return json({ error: "Worker secrets are not configured." }, 500);
  }

  if (path === "/api/account") {
    if (request.method !== "GET") {
      return json({ error: "Method not allowed." }, 405);
    }

    return callVidoGrid(`${V1}/account`, {
      method: "GET"
    }, env);
  }

  if (path === "/api/histories") {
    if (request.method !== "GET") {
      return json({ error: "Method not allowed." }, 405);
    }

    const upstream = new URL(`${V1}/histories`);

    for (const [key, value] of url.searchParams) {
      upstream.searchParams.set(key, value);
    }

    return callVidoGrid(upstream.toString(), {
      method: "GET"
    }, env);
  }

  if (path.startsWith("/api/history/")) {
    if (request.method !== "GET") {
      return json({ error: "Method not allowed." }, 405);
    }

    const uuid = path.slice("/api/history/".length);

    if (!uuid || uuid.includes("/")) {
      return json({ error: "Invalid history ID." }, 400);
    }

    return callVidoGrid(
      `${V1}/history/${encodeURIComponent(uuid)}`,
      { method: "GET" },
      env
    );
  }

  if (path === "/api/generate") {
    if (request.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    let form;

    try {
      form = await request.formData();
    } catch {
      return json({ error: "Could not read generation form." }, 400);
    }

    const model = form.get("model");

    if (!model || !MODELS[model]) {
      return json({ error: "Unsupported or missing model." }, 400);
    }

    const config = MODELS[model];

    const prompt = form.get("prompt");

    if (!prompt || !String(prompt).trim()) {
      return json({ error: "Please enter a prompt." }, 400);
    }

    // Only send the model field to endpoints that require it.
    form.delete("model");

    if (config.modelField) {
      form.set("model", model);
    }

    const base = config.version === 2 ? V2 : V1;
    const endpoint = `${base}${config.path}`;

    return callVidoGrid(endpoint, {
      method: "POST",
      body: form
    }, env);
  }

  if (path === "/api/family-data") {
    if (request.method === "GET") {
      const jobs = await getJobs(env);
      return json({ jobs });
    }

    if (request.method === "POST") {
      let data;

      try {
        data = await request.json();
      } catch {
        return json({ error: "Invalid JSON." }, 400);
      }

      if (data.action !== "addJob") {
        return json({ error: "Unknown action." }, 400);
      }

      if (!data.uuid || !data.prompt || !data.model) {
        return json({ error: "Missing job information." }, 400);
      }

      const job = {
        uuid: String(data.uuid),
        prompt: String(data.prompt),
        kind: String(data.kind || "video"),
        model: String(data.model),
        createdAt: Date.now()
      };

      await env.JOBS.put(
        `job:${job.uuid}`,
        JSON.stringify(job),
        { expirationTtl: 60 * 60 * 24 * 180 }
      );

      return json({ success: true, job });
    }

    return json({ error: "Method not allowed." }, 405);
  }

  return json({ error: "API route not found." }, 404);
}

export default {
  async fetch(request, env) {
    // Ask the browser to authenticate before serving the site or API.
    if (!isAuthorized(request, env)) {
      return new Response("Login required.", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Jaxbax Video Gen Tool"',
          "Cache-Control": "no-store"
        }
      });
    }

    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env);
      } catch (error) {
        return json({
          error: "The server encountered an error.",
          details: error.message
        }, 500);
      }
    }

    // Serve the website's static files.
    return env.ASSETS.fetch(request);
  }
};