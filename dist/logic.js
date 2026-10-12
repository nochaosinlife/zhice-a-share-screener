export const CONDITION_DEFS = {
  revenue_yoy: { label: "营收同比", short: "增长", unit: "%", op: ">=", default: 8, min: -20, max: 40, step: 1, weight: 18, rationale: "最近报告期营业收入同比增长" },
  revenue_accel: { label: "营收增速改善", short: "改善", unit: "百分点", op: ">=", default: 3, min: -10, max: 15, step: 0.5, weight: 18, rationale: "本期营收同比减上期营收同比" },
  roe: { label: "加权 ROE", short: "质量", unit: "%", op: ">=", default: 10, min: 0, max: 30, step: 1, weight: 14, rationale: "最近报告期加权净资产收益率" },
  pe_ttm: { label: "PE-TTM", short: "估值", unit: "倍", op: "<=", default: 30, min: 5, max: 100, step: 1, weight: 18, rationale: "最新总市值 / 过去四季度归母净利润" },
  volatility_20d: { label: "20 日波动率", short: "稳定", unit: "%", op: "<=", default: 2.5, min: 0.5, max: 6, step: 0.1, weight: 17, rationale: "20 日收益率标准差年化；数值越低越稳定" },
  drawdown_60d: { label: "60 日最大回撤下限", short: "回撤", unit: "%", op: ">=", default: -15, min: -40, max: 0, step: 1, weight: 15, rationale: "近 60 日收盘价相对区间高点的最大跌幅" },
};

export function defaultConditions() {
  return Object.fromEntries(Object.entries(CONDITION_DEFS).map(([key, def]) => [key, { enabled: true, value: def.default }]));
}

function pickNumber(text, patterns) {
  for (const pattern of patterns) {
    const found = text.match(pattern);
    if (found) return Number(found[1]);
  }
  return null;
}

export function parseIntent(input = "") {
  const text = input.trim();
  const conditions = defaultConditions();
  const ambiguities = [];
  const conflicts = [];

  if (/经营改善|基本面改善|业绩改善/.test(text)) conditions.revenue_accel.value = 3;
  if (/高增长|快速增长|成长性强/.test(text)) conditions.revenue_yoy.value = 15;
  if (/低估值|便宜|估值偏低/.test(text)) conditions.pe_ttm.value = 20;
  if (/高ROE|高 roe|盈利能力强/i.test(text)) conditions.roe.value = 15;
  if (/非常稳定|低波动|走势平稳/.test(text)) conditions.volatility_20d.value = 2;

  const revenue = pickNumber(text, [/(?:营收|收入)(?:同比|增速)?\s*(?:大于|高于|不少于|>=|>)\s*(-?\d+(?:\.\d+)?)/i]);
  const accel = pickNumber(text, [/(?:改善|加速|增速提升)\s*(?:大于|高于|不少于|>=|>)?\s*(-?\d+(?:\.\d+)?)/i]);
  const roe = pickNumber(text, [/(?:ROE|净资产收益率)\s*(?:大于|高于|不少于|>=|>)\s*(-?\d+(?:\.\d+)?)/i]);
  const peMax = pickNumber(text, [/(?:PE|市盈率)(?:-?TTM)?\s*(?:小于|低于|不高于|<=|<)\s*(\d+(?:\.\d+)?)/i]);
  const peMin = pickNumber(text, [/(?:PE|市盈率)(?:-?TTM)?\s*(?:大于|高于|不低于|>=|>)\s*(\d+(?:\.\d+)?)/i]);
  const vol = pickNumber(text, [/(?:波动率|波动)\s*(?:小于|低于|不高于|<=|<)\s*(\d+(?:\.\d+)?)/i]);
  const drawdown = pickNumber(text, [/(?:回撤)\s*(?:小于|低于|不超过|<=|<)\s*(\d+(?:\.\d+)?)/i]);

  if (revenue !== null) conditions.revenue_yoy.value = revenue;
  if (accel !== null) conditions.revenue_accel.value = accel;
  if (roe !== null) conditions.roe.value = roe;
  if (peMax !== null) conditions.pe_ttm.value = peMax;
  if (vol !== null) conditions.volatility_20d.value = vol;
  if (drawdown !== null) conditions.drawdown_60d.value = -Math.abs(drawdown);

  if (/估值合理/.test(text) && peMax === null) ambiguities.push({ key: "pe_ttm", term: "估值合理", interpretation: "PE-TTM ≤ 30 倍", choices: [20, 30, 40] });
  if (/相对稳定|走势稳定|稳定/.test(text) && vol === null) ambiguities.push({ key: "volatility_20d", term: "走势相对稳定", interpretation: "20 日年化波动率 ≤ 2.5%", choices: [2, 2.5, 3] });
  if (/经营改善/.test(text) && accel === null) ambiguities.push({ key: "revenue_accel", term: "经营改善", interpretation: "营收同比较上期提升 ≥ 3 个百分点", choices: [1, 3, 5] });

  if ((/高估值/.test(text) && /低估值|估值偏低/.test(text)) || (peMin !== null && peMax !== null && peMin > peMax)) {
    conflicts.push({ severity: "blocking", title: "估值范围冲突", detail: peMin !== null && peMax !== null ? `PE 同时要求 ≥ ${peMin} 且 ≤ ${peMax}` : "同时出现“高估值”和“低估值”", suggestion: "保留一个方向，或设置有效的 PE 区间。" });
  }
  if (/高波动/.test(text) && /稳定|低波动/.test(text)) conflicts.push({ severity: "warning", title: "走势偏好冲突", detail: "同时要求高波动与走势稳定", suggestion: "建议明确是寻找弹性，还是控制波动。" });

  return { input: text, conditions, ambiguities, conflicts, universe: "沪深 300 成分股（演示样本 12 只）", missingPolicy: "严格排除" };
}

export function evaluateCondition(stock, key, config) {
  const def = CONDITION_DEFS[key];
  const actual = stock[key];
  if (!config.enabled) return { key, status: "disabled", actual, expected: config.value, def };
  if (actual === null || actual === undefined || Number.isNaN(actual)) return { key, status: "missing", actual: null, expected: config.value, def };
  const passed = def.op === ">=" ? actual >= config.value : actual <= config.value;
  return { key, status: passed ? "pass" : "fail", actual, expected: config.value, def };
}

export function runScreen(stocks, conditions, { strictMissing = true } = {}) {
  return stocks.map((stock) => {
    const checks = Object.entries(conditions).map(([key, config]) => evaluateCondition(stock, key, config));
    const active = checks.filter((c) => c.status !== "disabled");
    const passedWeight = active.reduce((sum, c) => sum + (c.status === "pass" ? c.def.weight : 0), 0);
    const totalWeight = active.reduce((sum, c) => sum + c.def.weight, 0);
    const missing = active.filter((c) => c.status === "missing");
    const failed = active.filter((c) => c.status === "fail");
    const included = failed.length === 0 && (!strictMissing || missing.length === 0);
    const score = totalWeight ? Math.round((passedWeight / totalWeight) * 100) : 0;
    return { ...stock, checks, missing, failed, included, score };
  }).sort((a, b) => Number(b.included) - Number(a.included) || b.score - a.score || a.code.localeCompare(b.code));
}

export function summarizeImpact(previous, next) {
  const prevSet = new Set(previous.filter((s) => s.included).map((s) => s.code));
  const nextSet = new Set(next.filter((s) => s.included).map((s) => s.code));
  return {
    added: next.filter((s) => s.included && !prevSet.has(s.code)),
    removed: previous.filter((s) => s.included && !nextSet.has(s.code)),
    delta: nextSet.size - prevSet.size,
  };
}

export function cumulativeReturn(monthly) {
  return (monthly.reduce((value, item) => value * (1 + item / 100), 1) - 1) * 100;
}

export function maxDrawdown(monthly) {
  let value = 1, peak = 1, worst = 0;
  monthly.forEach((item) => { value *= 1 + item / 100; peak = Math.max(peak, value); worst = Math.min(worst, value / peak - 1); });
  return worst * 100;
}

export function backtest(selected, benchmark) {
  if (!selected.length) return null;
  const months = Math.max(...selected.map((s) => s.returns?.length || 0));
  const portfolio = Array.from({ length: months }, (_, i) => selected.reduce((sum, s) => sum + (s.returns?.[i] || 0), 0) / selected.length);
  return {
    portfolio, benchmark,
    total: cumulativeReturn(portfolio),
    benchmarkTotal: cumulativeReturn(benchmark),
    maxDrawdown: maxDrawdown(portfolio),
    positiveMonths: portfolio.filter((v) => v > 0).length,
  };
}

export function validateImportedStocks(input) {
  if (!Array.isArray(input)) throw new Error("顶层必须是股票数组");
  if (!input.length) throw new Error("数组不能为空");
  const required = ["code", "name", "industry", "revenue_yoy", "revenue_accel", "roe", "pe_ttm", "volatility_20d", "drawdown_60d"];
  input.forEach((row, index) => {
    if (!row || typeof row !== "object") throw new Error(`第 ${index + 1} 行不是对象`);
    ["code", "name", "industry"].forEach((key) => { if (!row[key]) throw new Error(`第 ${index + 1} 行缺少 ${key}`); });
    required.slice(3).forEach((key) => { if (!(key in row)) throw new Error(`第 ${index + 1} 行缺少 ${key}（缺失值请显式填 null）`); });
  });
  return input;
}

export function assessFreshness(asOf, now = new Date(), maxAgeDays = 7) {
  const parsed = new Date(asOf);
  if (Number.isNaN(parsed.getTime())) return { status: "unknown", ageDays: null, message: "无法解析数据时点" };
  const ageDays = Math.floor((now.getTime() - parsed.getTime()) / 86400000);
  if (ageDays < 0) return { status: "invalid", ageDays, message: "数据时点晚于当前时间" };
  if (ageDays > maxAgeDays) return { status: "stale", ageDays, message: `数据已过期 ${ageDays} 天` };
  return { status: "fresh", ageDays, message: `数据更新于 ${ageDays} 天内` };
}

