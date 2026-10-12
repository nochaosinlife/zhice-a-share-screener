import { FuyaoError, loadFuyaoData } from "./fuyao.js";

const CACHE_SECONDS = 15 * 60;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

async function marketData(request, env, ctx) {
  if (!env.HITHINK_FINANCE_API_KEY) {
    return json({ ok: false, code: "SERVER_KEY_MISSING", message: "服务端尚未配置扶摇 API Key；当前只能使用明确标识的演示数据。" }, 503);
  }
  const cache = caches.default;
  const cacheKey = new Request(new URL("/api/market-data", request.url), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  try {
    const payload = await loadFuyaoData({
      apiKey: env.HITHINK_FINANCE_API_KEY,
      currentReport: env.FUYAO_CURRENT_REPORT,
      previousReport: env.FUYAO_PREVIOUS_REPORT,
    });
    const response = json(payload, 200, { "cache-control": `public, max-age=60, s-maxage=${CACHE_SECONDS}` });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    const known = error instanceof FuyaoError;
    return json({
      ok: false,
      code: known ? error.code : "SERVER_ERROR",
      message: known ? error.message : "服务端获取真实数据失败",
      requestId: known ? error.requestId : null,
      endpoint: known ? error.endpoint : null,
    }, known && String(error.code).startsWith("2") ? 502 : 500);
  }
}

export function createWorker(assets = {}) {
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/api/health") {
        return json({ ok: true, configured: Boolean(env.HITHINK_FINANCE_API_KEY), service: "zhice-fuyao-gateway" });
      }
      if (request.method === "GET" && url.pathname === "/api/market-data") return marketData(request, env, ctx);
      if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
      const key = url.pathname === "/" ? "/index.html" : url.pathname;
      const asset = assets[key];
      if (!asset) return new Response("Not found", { status: 404 });
      return new Response(request.method === "HEAD" ? null : asset.body, {
        headers: {
          "content-type": asset.type,
          "cache-control": key === "/index.html" ? "no-cache" : "public, max-age=300",
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin-when-cross-origin",
        },
      });
    },
  };
}
