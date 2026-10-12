import test from "node:test";
import assert from "node:assert/strict";
import { dailyVolatilityPct, inferReports, loadFuyaoData, maxDrawdownPct, monthlyReturnsPct } from "../server/fuyao.js";
import { createWorker } from "../server/worker.js";

function response(data) {
  return new Response(JSON.stringify({ code: 0, message: "success", request_id: `req-${Math.random()}`, data }), {
    headers: { "content-type": "application/json" },
  });
}

function bars(count = 80) {
  const start = Date.UTC(2025, 0, 1);
  return Array.from({ length: count }, (_, index) => ({
    date_ms: start + index * 86400000,
    close_price: 100 + index * 0.5 + (index % 5 === 0 ? -1 : 0),
    turnover: 1_000_000_000 + index,
  }));
}

test("真实数据派生指标使用明确口径", () => {
  const history = bars(80);
  assert.ok(Number.isFinite(dailyVolatilityPct(history)));
  assert.ok(maxDrawdownPct(history) <= 0);
  assert.ok(monthlyReturnsPct(history).length > 0);
  assert.deepEqual(inferReports(new Date("2026-10-12T00:00:00Z")), { current: "2026-2", previous: "2026-1" });
});

test("服务端编排官方行情、估值、财务和历史端点", async () => {
  const called = [];
  const fetchImpl = async (input) => {
    const url = new URL(input);
    called.push(url.pathname);
    if (url.pathname === "/api/a-share/prices/snapshot") return response({ timestamp: Date.now(), item: [{ thscode: "600036.SH", last_price: 40 }] });
    if (url.pathname === "/api/a-share/valuations/snapshot") return response({ timestamp: Date.now(), item: [{ thscode: "600036.SH", pe_ttm: 7, pb_mrq: 1 }] });
    if (url.pathname === "/api/a-share/financials/indicators") {
      const current = url.searchParams.get("report") === "2026-2";
      return response({ abilities: [{ indicators: [
        { index_id: "operating_income_yoy_growth_ratio", value: current ? "9" : "6" },
        { index_id: "index_weighted_avg_roe", value: "12" },
      ] }] });
    }
    if (url.pathname === "/api/a-share/prices/historical") return response({ timestamp: Date.now(), item: bars() });
    if (url.pathname === "/api/a-share-index/prices/historical") return response({ timestamp: Date.now(), item: bars() });
    throw new Error(`unexpected ${url.pathname}`);
  };
  const payload = await loadFuyaoData({
    fetchImpl,
    apiKey: "test-only",
    now: new Date("2026-10-12T00:00:00Z"),
    universe: [{ code: "600036.SH", name: "招商银行", industry: "银行" }],
  });
  assert.equal(payload.stocks[0].revenue_accel, 3);
  assert.equal(payload.stocks[0].pe_ttm, 7);
  assert.equal(payload.meta.mode, "live");
  for (const endpoint of ["/api/a-share/prices/snapshot", "/api/a-share/valuations/snapshot", "/api/a-share/financials/indicators", "/api/a-share/prices/historical", "/api/a-share-index/prices/historical"]) {
    assert.ok(called.includes(endpoint), `missing ${endpoint}`);
  }
});

test("未配置服务端密钥时健康检查只返回配置状态，不泄露秘密", async () => {
  const worker = createWorker({ "/index.html": { body: "ok", type: "text/plain" } });
  const result = await worker.fetch(new Request("https://example.com/api/health"), {}, { waitUntil() {} });
  assert.deepEqual(await result.json(), { ok: true, configured: false, service: "zhice-fuyao-gateway" });
});
