const BASE_URL = "https://fuyao.aicubes.cn";

export const DEFAULT_UNIVERSE = [
  { code: "600036.SH", name: "招商银行", industry: "银行" },
  { code: "600519.SH", name: "贵州茅台", industry: "食品饮料" },
  { code: "000333.SZ", name: "美的集团", industry: "家用电器" },
  { code: "601318.SH", name: "中国平安", industry: "非银金融" },
  { code: "600276.SH", name: "恒瑞医药", industry: "医药生物" },
  { code: "300750.SZ", name: "宁德时代", industry: "电力设备" },
  { code: "600887.SH", name: "伊利股份", industry: "食品饮料" },
  { code: "002475.SZ", name: "立讯精密", industry: "电子" },
  { code: "000651.SZ", name: "格力电器", industry: "家用电器" },
  { code: "601012.SH", name: "隆基绿能", industry: "电力设备" },
  { code: "600309.SH", name: "万华化学", industry: "基础化工" },
  { code: "688981.SH", name: "中芯国际", industry: "电子" },
];

export class FuyaoError extends Error {
  constructor(message, { code = "UPSTREAM_ERROR", requestId = null, endpoint = null } = {}) {
    super(message);
    this.name = "FuyaoError";
    this.code = code;
    this.requestId = requestId;
    this.endpoint = endpoint;
  }
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function inferReports(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  if (month >= 11) return { current: `${year}-3`, previous: `${year}-2` };
  if (month >= 9) return { current: `${year}-2`, previous: `${year}-1` };
  if (month >= 5) return { current: `${year}-1`, previous: `${year - 1}-4` };
  return { current: `${year - 1}-3`, previous: `${year - 1}-2` };
}

export function dailyVolatilityPct(bars, window = 20) {
  const closes = bars
    .map((bar) => finiteOrNull(bar.close_price))
    .filter((value) => value !== null)
    .slice(-(window + 1));
  if (closes.length < window + 1) return null;
  const returns = closes.slice(1).map((close, index) => close / closes[index] - 1);
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length;
  return round(Math.sqrt(variance) * 100);
}

export function maxDrawdownPct(bars, window = 60) {
  const closes = bars
    .map((bar) => finiteOrNull(bar.close_price))
    .filter((value) => value !== null)
    .slice(-window);
  if (closes.length < 2) return null;
  let peak = closes[0];
  let worst = 0;
  for (const close of closes) {
    peak = Math.max(peak, close);
    worst = Math.min(worst, close / peak - 1);
  }
  return round(worst * 100);
}

export function monthlyReturnsPct(bars, count = 12) {
  const byMonth = new Map();
  for (const bar of bars) {
    const close = finiteOrNull(bar.close_price);
    const dateMs = finiteOrNull(bar.date_ms);
    if (close === null || dateMs === null) continue;
    const date = new Date(dateMs);
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const existing = byMonth.get(key);
    if (!existing || dateMs > existing.dateMs) byMonth.set(key, { dateMs, close });
  }
  const closes = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value.close);
  if (closes.length < 2) return [];
  return closes.slice(1).map((close, index) => round((close / closes[index] - 1) * 100)).slice(-count);
}

export function flattenIndicators(data) {
  const result = {};
  for (const ability of data?.abilities || []) {
    for (const indicator of ability?.indicators || []) result[indicator.index_id] = finiteOrNull(indicator.value);
  }
  return result;
}

function source(endpoint, field, unit, asOf, requestId, extra = {}) {
  return { provider: "同花顺扶摇", endpoint, field, unit, asOf, requestId, ...extra };
}

async function requestJson(fetchImpl, apiKey, endpoint, params) {
  const url = new URL(endpoint, BASE_URL);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== null && value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetchImpl(url, { headers: { "X-api-key": apiKey, accept: "application/json" } });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new FuyaoError(`扶摇返回了无法解析的响应（HTTP ${response.status}）`, { endpoint });
  }
  if (!response.ok || payload?.code !== 0) {
    throw new FuyaoError(payload?.message || `扶摇请求失败（HTTP ${response.status}）`, {
      code: payload?.code ?? `HTTP_${response.status}`,
      requestId: payload?.request_id || null,
      endpoint,
    });
  }
  return payload;
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function errorRecord(error, code) {
  return {
    code,
    endpoint: error.endpoint || null,
    upstreamCode: error.code || "UPSTREAM_ERROR",
    requestId: error.requestId || null,
    message: error.message,
  };
}

function latestTimestamp(payloads) {
  const values = payloads.map((payload) => finiteOrNull(payload?.data?.timestamp)).filter((value) => value !== null);
  return values.length ? Math.max(...values) : Date.now();
}

export async function loadFuyaoData({
  fetchImpl = fetch,
  apiKey,
  now = new Date(),
  universe = DEFAULT_UNIVERSE,
  currentReport,
  previousReport,
} = {}) {
  if (!apiKey) throw new FuyaoError("服务端尚未配置 HITHINK_FINANCE_API_KEY", { code: "SERVER_KEY_MISSING" });
  const inferred = inferReports(now);
  const reports = { current: currentReport || inferred.current, previous: previousReport || inferred.previous };
  const codes = universe.map((stock) => stock.code).join(",");
  const end = now.getTime();
  const start = end - 400 * 86400000;

  const [prices, valuations] = await Promise.all([
    requestJson(fetchImpl, apiKey, "/api/a-share/prices/snapshot", { thscodes: codes }),
    requestJson(fetchImpl, apiKey, "/api/a-share/valuations/snapshot", { thscodes: codes }),
  ]);
  const priceMap = new Map((prices.data?.item || []).map((item) => [item.thscode, item]));
  const valuationMap = new Map((valuations.data?.item || []).map((item) => [item.thscode, item]));
  const errors = [];

  const details = await mapLimit(universe, 4, async (stock) => {
    const requests = await Promise.allSettled([
      requestJson(fetchImpl, apiKey, "/api/a-share/financials/indicators", { thscode: stock.code, report: reports.current }),
      requestJson(fetchImpl, apiKey, "/api/a-share/financials/indicators", { thscode: stock.code, report: reports.previous }),
      requestJson(fetchImpl, apiKey, "/api/a-share/prices/historical", { thscode: stock.code, interval: "1d", start, end, adjust: "forward" }),
    ]);
    const labels = ["financial_current", "financial_previous", "price_history"];
    requests.forEach((result, index) => {
      if (result.status === "rejected") errors.push(errorRecord(result.reason, `${stock.code}:${labels[index]}`));
    });
    return requests.map((result) => result.status === "fulfilled" ? result.value : null);
  });

  const asOfMs = latestTimestamp([prices, valuations, ...details.flat().filter(Boolean)]);
  const asOf = new Date(asOfMs).toISOString();
  const stocks = universe.map((base, index) => {
    const quote = priceMap.get(base.code) || {};
    const valuation = valuationMap.get(base.code) || {};
    const [currentPayload, previousPayload, historyPayload] = details[index];
    const current = flattenIndicators(currentPayload?.data);
    const previous = flattenIndicators(previousPayload?.data);
    const bars = [...(historyPayload?.data?.item || [])].sort((a, b) => a.date_ms - b.date_ms);
    const revenue = current.operating_income_yoy_growth_ratio ?? null;
    const previousRevenue = previous.operating_income_yoy_growth_ratio ?? null;
    const revenueAccel = revenue === null || previousRevenue === null ? null : round(revenue - previousRevenue);
    const financialRequestId = currentPayload?.request_id || null;
    const historyRequestId = historyPayload?.request_id || null;
    return {
      ...base,
      close: finiteOrNull(quote.last_price),
      revenue_yoy: revenue,
      revenue_accel: revenueAccel,
      roe: current.index_weighted_avg_roe ?? null,
      pe_ttm: finiteOrNull(valuation.pe_ttm),
      pb_mrq: finiteOrNull(valuation.pb_mrq),
      volatility_20d: dailyVolatilityPct(bars),
      drawdown_60d: maxDrawdownPct(bars),
      turnover_20d: (() => {
        const values = bars.slice(-20).map((bar) => finiteOrNull(bar.turnover)).filter((value) => value !== null);
        return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length / 1e8) : null;
      })(),
      returns: monthlyReturnsPct(bars),
      sources: {
        close: source("/api/a-share/prices/snapshot", "last_price", "元", asOf, prices.request_id),
        revenue_yoy: source("/api/a-share/financials/indicators", "operating_income_yoy_growth_ratio", "%", reports.current, financialRequestId),
        revenue_accel: source("派生计算", "本期营业收入同比增长率 - 上期营业收入同比增长率", "百分点", `${reports.previous} → ${reports.current}`, financialRequestId),
        roe: source("/api/a-share/financials/indicators", "index_weighted_avg_roe", "%", reports.current, financialRequestId),
        pe_ttm: source("/api/a-share/valuations/snapshot", "pe_ttm", "倍", asOf, valuations.request_id),
        pb_mrq: source("/api/a-share/valuations/snapshot", "pb_mrq", "倍", asOf, valuations.request_id),
        volatility_20d: source("派生计算", "std(日收益率,20)", "%", asOf, historyRequestId, { adjust: "forward" }),
        drawdown_60d: source("派生计算", "min(close / 历史前高 - 1,60)", "%", asOf, historyRequestId, { adjust: "forward" }),
        turnover_20d: source("派生计算", "avg(turnover,20)", "亿元", asOf, historyRequestId, { adjust: "forward" }),
      },
    };
  });

  let benchmarkReturns = [];
  try {
    const benchmark = await requestJson(fetchImpl, apiKey, "/api/a-share-index/prices/historical", {
      thscode: "000300.SH", interval: "1d", start, end,
    });
    benchmarkReturns = monthlyReturnsPct(benchmark.data?.item || []);
  } catch (error) {
    errors.push(errorRecord(error, "000300.SH:benchmark_history"));
  }

  return {
    ok: true,
    stocks,
    benchmarkReturns,
    meta: {
      mode: "live",
      label: errors.length ? "扶摇真实数据 · 部分字段缺失" : "扶摇真实数据 · 服务端安全接入",
      asOf,
      reportPeriod: `${reports.current}（对比 ${reports.previous}）`,
      note: errors.length
        ? `真实接口已返回；${errors.length} 个子请求失败，相关字段保持 null，未使用构造值补齐。`
        : "行情、估值、财务和历史 K 线均由服务端调用扶摇；浏览器未接触 API Key。",
      universe: `固定研究样本 ${stocks.length} 只`,
      source: "同花顺扶摇金融数据 API",
      generatedAt: now.toISOString(),
      requestIds: [prices.request_id, valuations.request_id].filter(Boolean),
    },
    errors,
  };
}
