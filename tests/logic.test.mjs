import test from "node:test";
import assert from "node:assert/strict";
import { STOCKS, BENCHMARK_RETURNS } from "../dist/data.js";
import { parseIntent, runScreen, summarizeImpact, backtest, validateImportedStocks, assessFreshness } from "../dist/logic.js";

test("主链路：模糊意图被转换为条件并要求澄清", () => {
  const parsed = parseIntent("经营改善、估值合理、走势相对稳定");
  assert.equal(parsed.conditions.pe_ttm.value, 30);
  assert.equal(parsed.conditions.volatility_20d.value, 2.5);
  assert.deepEqual(parsed.ambiguities.map((item) => item.key), ["pe_ttm", "volatility_20d", "revenue_accel"]);
});

test("明确数字覆盖默认阈值", () => {
  const parsed = parseIntent("营收增速高于15，PE低于25，ROE高于12，波动率低于2");
  assert.equal(parsed.conditions.revenue_yoy.value, 15);
  assert.equal(parsed.conditions.pe_ttm.value, 25);
  assert.equal(parsed.conditions.roe.value, 12);
  assert.equal(parsed.conditions.volatility_20d.value, 2);
});

test("冲突边界：不可满足的 PE 区间会阻断", () => {
  const parsed = parseIntent("PE大于50，同时PE小于20");
  assert.equal(parsed.conflicts[0].severity, "blocking");
});

test("确定性：相同输入重复筛选结果一致", () => {
  const conditions = parseIntent("经营改善、估值合理、走势稳定").conditions;
  const once = runScreen(STOCKS, conditions).map(({ code, included, score }) => ({ code, included, score }));
  const twice = runScreen(STOCKS, conditions).map(({ code, included, score }) => ({ code, included, score }));
  assert.deepEqual(once, twice);
});

test("数据缺失：严格策略排除，宽松策略可保留", () => {
  const row = { ...STOCKS[0], roe: null };
  const conditions = parseIntent("").conditions;
  const strict = runScreen([row], conditions, { strictMissing: true })[0];
  const lenient = runScreen([row], conditions, { strictMissing: false })[0];
  assert.equal(strict.included, false);
  assert.equal(lenient.included, true);
  assert.equal(strict.missing[0].key, "roe");
  assert.ok(lenient.score < 100);
});

test("条件变化影响可回溯到新增和移除名单", () => {
  const base = parseIntent("").conditions;
  const previous = runScreen(STOCKS, base);
  const relaxed = structuredClone(base); relaxed.pe_ttm.value = 50; relaxed.volatility_20d.value = 4;
  const next = runScreen(STOCKS, relaxed);
  const impact = summarizeImpact(previous, next);
  assert.equal(impact.delta, impact.added.length - impact.removed.length);
});

test("接口异常：空数组与坏结构拒绝导入", () => {
  assert.throws(() => validateImportedStocks([]), /不能为空/);
  assert.throws(() => validateImportedStocks([{ code: "600036.SH" }]), /缺少 name/);
});

test("缺失字段必须显式为 null，不能完全省略", () => {
  const invalid = { code: "600036.SH", name: "招商银行", industry: "银行", revenue_yoy: 1, revenue_accel: 1, roe: 1, pe_ttm: 1, volatility_20d: 1 };
  assert.throws(() => validateImportedStocks([invalid]), /drawdown_60d/);
  const valid = { ...invalid, drawdown_60d: null };
  assert.equal(validateImportedStocks([valid]).length, 1);
});

test("回测无候选时不生成正常结论", () => {
  assert.equal(backtest([], BENCHMARK_RETURNS), null);
});

test("回测返回累计收益、回撤和月份明细", () => {
  const report = backtest(STOCKS.slice(0, 2), BENCHMARK_RETURNS);
  assert.equal(report.portfolio.length, 12);
  assert.ok(Number.isFinite(report.total));
  assert.ok(report.maxDrawdown <= 0);
});

test("过期和未来数据时点不会被标记为正常", () => {
  const now = new Date("2026-10-12T12:00:00+08:00");
  assert.equal(assessFreshness("2026-10-09 15:00 GMT+0800", now).status, "fresh");
  assert.equal(assessFreshness("2026-09-01 15:00 GMT+0800", now).status, "stale");
  assert.equal(assessFreshness("2026-11-01 15:00 GMT+0800", now).status, "invalid");
  assert.equal(assessFreshness("not-a-date", now).status, "unknown");
});

