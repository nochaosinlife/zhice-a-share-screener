import { STOCKS, DATA_META, BENCHMARK_RETURNS } from "./data.js";
import { CONDITION_DEFS, parseIntent, runScreen, summarizeImpact, backtest, validateImportedStocks, assessFreshness } from "./logic.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
const fmt = (value, digits = 1) => value === null || value === undefined ? "缺失" : Number(value).toFixed(digits);
const copy = (value) => JSON.parse(JSON.stringify(value));

const initial = parseIntent($("#intentInput").value);
const state = {
  stocks: copy(STOCKS), dataMeta: copy(DATA_META), intent: initial,
  conditions: copy(initial.conditions), results: [], preview: [], tab: "included", sort: "score",
  compare: new Set(), strictMissing: true,
};

function toast(message) {
  const el = $("#toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 2400);
}

function conditionText(check) {
  const unit = check.def.unit; const actual = check.actual === null ? "缺失" : `${fmt(check.actual)}${unit}`;
  return `${check.def.label} ${actual}（要求 ${check.def.op} ${check.expected}${unit}）`;
}

function renderConflicts() {
  const box = $("#conflictBox"); box.innerHTML = state.intent.conflicts.map((item) => `<div class="conflict"><b>!</b><div><strong>${esc(item.title)}</strong><p>${esc(item.detail)}。${esc(item.suggestion)}</p></div></div>`).join("");
  $("#runBtn").disabled = state.intent.conflicts.some((item) => item.severity === "blocking");
}

function renderClarifications() {
  const card = $("#clarifyCard"), list = $("#clarifications");
  card.hidden = state.intent.ambiguities.length === 0;
  $(".clarify-head span", card).textContent = `✦ AI 发现 ${state.intent.ambiguities.length} 个模糊表达`;
  list.innerHTML = state.intent.ambiguities.map((item) => `<div class="clarify-row"><strong>“${esc(item.term)}”</strong><p>${esc(item.interpretation)}</p><div class="choice-group">${item.choices.map((v) => `<button data-key="${item.key}" data-value="${v}" class="${state.conditions[item.key].value === v ? "active" : ""}">${v}${CONDITION_DEFS[item.key].unit}</button>`).join("")}</div></div>`).join("");
  $$(".choice-group button", list).forEach((button) => button.addEventListener("click", () => {
    state.conditions[button.dataset.key].value = Number(button.dataset.value);
    renderConditions(); renderClarifications(); updatePreview();
  }));
}

function renderConditions() {
  const host = $("#conditions"); host.innerHTML = "";
  Object.entries(CONDITION_DEFS).forEach(([key, def]) => {
    const config = state.conditions[key]; const row = document.createElement("div");
    row.className = `condition-row ${config.enabled ? "" : "off"}`;
    row.innerHTML = `<button class="toggle ${config.enabled ? "on" : ""}" aria-label="${config.enabled ? "禁用" : "启用"}${esc(def.label)}" aria-pressed="${config.enabled}"><i></i></button><div class="cond-name"><strong>${esc(def.label)}</strong><small>${esc(def.rationale)}</small></div><span class="cond-op">${def.op}</span><label class="value-control"><input type="number" value="${config.value}" min="${def.min}" max="${def.max}" step="${def.step}" aria-label="${esc(def.label)}阈值"><span>${def.unit}</span></label>`;
    $(".toggle", row).addEventListener("click", () => { config.enabled = !config.enabled; renderConditions(); updatePreview(); });
    $("input", row).addEventListener("input", (event) => {
      const value = Number(event.target.value); if (!Number.isFinite(value)) return;
      config.value = Math.min(def.max, Math.max(def.min, value)); updatePreview();
    });
    host.append(row);
  });
  const count = Object.values(state.conditions).filter((item) => item.enabled).length;
  $("#activeCount").textContent = `${count} 条已启用`;
}

function updatePreview() {
  state.preview = runScreen(state.stocks, state.conditions, { strictMissing: state.strictMissing });
  const impact = summarizeImpact(state.results, state.preview);
  const count = state.preview.filter((item) => item.included).length;
  let detail = `新条件将筛出 ${count} 只候选`;
  if (state.results.length) detail += `；较当前结果 ${impact.delta > 0 ? "+" : ""}${impact.delta} 只`;
  if (impact.added.length) detail += `，新增 ${impact.added.slice(0, 2).map((s) => s.name).join("、")}`;
  if (impact.removed.length) detail += `，移除 ${impact.removed.slice(0, 2).map((s) => s.name).join("、")}`;
  $("#impactText").textContent = detail;
}

function cardReason(stock) {
  if (stock.included) return `通过全部已启用条件。优势：${stock.checks.filter((c) => c.status === "pass").sort((a, b) => b.def.weight - a.def.weight).slice(0, 2).map(conditionText).join("；")}`;
  if (stock.failed.length) return `排除主因：${conditionText(stock.failed[0])}${stock.failed.length > 1 ? `；另有 ${stock.failed.length - 1} 条未通过` : ""}`;
  return `排除主因：${stock.missing.map((c) => c.def.label).join("、")}缺失；严格策略不允许静默补值。`;
}

function renderResults() {
  const included = state.results.filter((item) => item.included), excluded = state.results.filter((item) => !item.included);
  const missing = state.results.filter((item) => item.missing.length).length;
  $("#inCount").textContent = included.length; $("#outCount").textContent = excluded.length; $("#allCount").textContent = state.results.length;
  $("#resultMeta").textContent = `${state.dataMeta.asOf} · ${state.dataMeta.reportPeriod} · 确定性规则逐条计算`;
  const freshness = assessFreshness(state.dataMeta.asOf);
  $("#dataLabel").textContent = `${state.dataMeta.label}${freshness.status === "stale" ? " · 已过期" : freshness.status === "invalid" ? " · 时点异常" : ""}`;
  $("#dataNote").textContent = freshness.status === "fresh" ? state.dataMeta.note : `${state.dataMeta.note}；${freshness.message}，请刷新或导入新快照。`;
  const dataStatus = $("#dataStatus"); dataStatus.lastChild.textContent = state.dataMeta.mode === "live" ? " 已导入真实数据" : state.dataMeta.mode === "mixed" ? " 混合数据" : " 审计演示数据";
  dataStatus.classList.toggle("live", state.dataMeta.mode === "live");
  $("#stats").innerHTML = `<div class="stat"><small>样本总数</small><strong>${state.results.length}</strong></div><div class="stat"><small>满足全部条件</small><strong class="green">${included.length}</strong></div><div class="stat"><small>因条件排除</small><strong>${excluded.length}</strong></div><div class="stat"><small>含缺失字段</small><strong>${missing}</strong></div>`;

  let shown = state.tab === "included" ? included : state.tab === "excluded" ? excluded : [...state.results];
  shown = [...shown].sort((a, b) => state.sort === "pe" ? (a.pe_ttm ?? Infinity) - (b.pe_ttm ?? Infinity) : state.sort === "vol" ? (a.volatility_20d ?? Infinity) - (b.volatility_20d ?? Infinity) : b.score - a.score);
  const grid = $("#resultGrid"); grid.innerHTML = ""; $("#emptyState").hidden = shown.length > 0;
  shown.forEach((stock) => {
    const fragment = $("#stockTemplate").content.cloneNode(true), card = $(".stock-card", fragment);
    card.classList.toggle("excluded", !stock.included);
    $(".status-badge", card).textContent = stock.included ? "✓ 入选" : stock.missing.length && !stock.failed.length ? "? 数据缺失" : "× 排除";
    $(".stock-logo", card).textContent = stock.name.slice(0, 1); $(".stock-title strong", card).textContent = stock.name;
    $(".stock-title small", card).textContent = `${stock.code} · ${stock.industry}`; $(".stock-title>b", card).textContent = stock.close == null ? "—" : `¥${fmt(stock.close, 2)}`;
    $(".score-line i", card).style.width = `${stock.score}%`; $(".score-line strong", card).textContent = `${stock.score}%`;
    $(".reason", card).textContent = cardReason(stock);
    const metricKeys = ["revenue_accel", "pe_ttm", "volatility_20d"];
    $(".metrics", card).innerHTML = metricKeys.map((key) => { const check = stock.checks.find((c) => c.key === key); return `<div class="metric ${check.status}"><small>${esc(check.def.short)}</small><strong>${check.actual == null ? "缺失" : `${fmt(check.actual)}${check.def.unit}`}</strong></div>`; }).join("");
    const compare = $(".compare-check input", card); compare.checked = state.compare.has(stock.code);
    compare.addEventListener("change", () => toggleCompare(stock.code, compare.checked));
    $(".stock-title", card).addEventListener("click", () => openStock(stock));
    $(".trace-btn", card).addEventListener("click", () => openStock(stock));
    grid.append(fragment);
  });
}

function run({ scroll = false } = {}) {
  state.results = runScreen(state.stocks, state.conditions, { strictMissing: state.strictMissing }); state.preview = state.results;
  renderResults(); updatePreview(); if (scroll) $("#results").scrollIntoView({ behavior: "smooth" });
}

function toggleCompare(code, checked) {
  if (checked && state.compare.size >= 3) { toast("最多同时比较 3 只股票"); renderResults(); return; }
  checked ? state.compare.add(code) : state.compare.delete(code); renderCompareBar();
}

function renderCompareBar() {
  const bar = $("#compareBar"); bar.hidden = state.compare.size === 0; $("#compareCount").textContent = state.compare.size;
  $("#compareChips").innerHTML = [...state.compare].map((code) => `<span class="compare-chip">${esc(state.stocks.find((s) => s.code === code)?.name || code)}</span>`).join("");
}

function showModal(html) {
  $("#modalBody").innerHTML = html; $("#backdrop").hidden = false; const modal = $("#modal"); if (!modal.open) modal.show();
}
function closeModal() { const modal = $("#modal"); if (modal.open) modal.close(); $("#backdrop").hidden = true; }

function openStock(stock) {
  const rows = stock.checks.filter((c) => c.status !== "disabled").map((c) => {
    const source = stock.sources?.[c.key] || { provider: state.dataMeta.mode === "live" ? "导入数据" : "未提供", endpoint: "—", field: c.key, unit: c.def.unit, asOf: state.dataMeta.asOf };
    return `<tr><td>${esc(c.def.label)}</td><td>${c.actual == null ? "—" : `${fmt(c.actual)} ${esc(c.def.unit)}`}</td><td>${esc(c.def.op)} ${c.expected} ${esc(c.def.unit)}</td><td class="${c.status}">${c.status === "pass" ? "通过" : c.status === "fail" ? "未通过" : "缺失"}<span class="source-note">${esc(source.provider)} · ${esc(source.endpoint)}<br>${esc(source.field)} · ${esc(source.asOf)} · ${esc(source.unit)}</span></td></tr>`;
  }).join("");
  showModal(`<div class="modal-content"><span class="card-kicker">DECISION TRACE</span><h2>${esc(stock.name)} <small>${esc(stock.code)}</small></h2><p class="lead">${esc(cardReason(stock))}</p><table class="trace-table"><thead><tr><th>条件</th><th>原始值</th><th>阈值</th><th>结论与来源</th></tr></thead><tbody>${rows}</tbody></table><div class="modal-section"><h3>事实、推断与边界</h3><p><b>事实：</b>表中的原始字段与时点。<br><b>推断：</b>确定性比较运算产生的“通过/排除”。<br><b>边界：</b>入选仅表示满足当前条件，不代表未来上涨或适合买入。</p></div></div>`);
}

function openCompare() {
  const stocks = state.results.filter((s) => state.compare.has(s.code)); if (stocks.length < 2) return toast("请至少选择 2 只股票");
  const keys = Object.keys(CONDITION_DEFS).filter((key) => state.conditions[key].enabled);
  showModal(`<div class="modal-content"><span class="card-kicker">SIDE BY SIDE</span><h2>候选对比</h2><p class="lead">同一口径、同一时点横向比较。绿色仅表示满足当前阈值。</p><table class="compare-table"><thead><tr><th>指标</th>${stocks.map((s) => `<th>${esc(s.name)}</th>`).join("")}</tr></thead><tbody><tr><td>匹配度</td>${stocks.map((s) => `<td>${s.score}%</td>`).join("")}</tr>${keys.map((key) => `<tr><td>${esc(CONDITION_DEFS[key].label)}</td>${stocks.map((s) => { const c = s.checks.find((x) => x.key === key); return `<td class="${c.status}">${c.actual == null ? "缺失" : `${fmt(c.actual)}${esc(c.def.unit)}`}</td>`; }).join("")}</tr>`).join("")}</tbody></table></div>`);
}

function openBacktest() {
  const selected = state.results.filter((s) => s.included && Array.isArray(s.returns)); const report = backtest(selected, BENCHMARK_RETURNS);
  if (!report) return showModal(`<div class="modal-content"><h2>无法运行回测</h2><p class="lead">当前没有同时具备入选状态和历史月收益序列的股票。缺失时不会生成虚假结果。</p></div>`);
  const max = Math.max(...report.portfolio.map(Math.abs), ...report.benchmark.map(Math.abs), 1);
  const bars = report.portfolio.map((v, i) => `<div class="bar-pair" title="第${i + 1}月：组合${fmt(v)}%，基准${fmt(report.benchmark[i])}%"><i style="height:${Math.max(2, Math.abs(v) / max * 100)}%"></i><i style="height:${Math.max(2, Math.abs(report.benchmark[i]) / max * 100)}%"></i></div>`).join("");
  showModal(`<div class="modal-content"><span class="card-kicker">RESEARCH SIMULATION</span><h2>12 个月等权回测</h2><p class="lead">每月末等权、未计交易成本。演示数据的收益序列为构造数据；导入真实历史收益后才具有研究意义。</p><div class="backtest-stats"><div><small>组合累计</small><strong>${fmt(report.total)}%</strong></div><div><small>同期基准</small><strong>${fmt(report.benchmarkTotal)}%</strong></div><div><small>最大回撤</small><strong>${fmt(report.maxDrawdown)}%</strong></div></div><div class="chart">${bars}</div><div class="modal-section"><p>绿色：组合月收益绝对值；灰色：基准。该回测不含幸存者偏差、停牌、涨跌停与交易成本处理，不构成收益承诺。</p></div></div>`);
}

function saveStrategy() {
  const items = JSON.parse(localStorage.getItem("zhice-strategies") || "[]");
  items.unshift({ id: Date.now(), name: $("#intentInput").value.slice(0, 32), savedAt: new Date().toLocaleString("zh-CN"), conditions: state.conditions, strictMissing: state.strictMissing, dataLabel: state.dataMeta.label });
  localStorage.setItem("zhice-strategies", JSON.stringify(items.slice(0, 20))); toast("策略已保存到当前浏览器");
}

function openSaved() {
  const items = JSON.parse(localStorage.getItem("zhice-strategies") || "[]");
  showModal(`<div class="modal-content"><h2>已保存策略</h2><p class="lead">保存在当前浏览器，不上传个人数据。</p>${items.length ? items.map((item) => `<div class="saved-item"><div><strong>${esc(item.name)}</strong><small>${esc(item.savedAt)} · ${esc(item.dataLabel)}</small></div><button data-load="${item.id}">载入</button></div>`).join("") : `<div class="empty-state"><p>还没有保存策略。</p></div>`}</div>`);
  $$('[data-load]', $("#modalBody")).forEach((button) => button.addEventListener("click", () => { const item = items.find((x) => String(x.id) === button.dataset.load); state.conditions = copy(item.conditions); state.strictMissing = item.strictMissing; $("#missingPolicy").value = item.strictMissing ? "strict" : "lenient"; renderConditions(); run(); closeModal(); toast("已载入策略"); }));
}

function openMonitor() {
  showModal(`<div class="modal-content"><span class="card-kicker">MONITOR</span><h2>转为监控任务</h2><p class="lead">原型会把任务保存在浏览器中。生产版需连接服务端调度器，页面关闭后才能继续运行。</p><div class="form-row"><div class="form-field"><label>任务名称</label><input id="monitorName" value="${esc($("#intentInput").value.slice(0, 24))}"></div><div class="form-field"><label>运行频率</label><select id="monitorFreq"><option>每个交易日收盘后</option><option>每周五收盘后</option><option>每月最后交易日</option></select></div></div><div class="modal-section"><h3>仅在这些变化时提醒</h3><label><input type="checkbox" id="notifyAdd" checked> 新股票进入候选</label>　<label><input type="checkbox" id="notifyRemove" checked> 原候选被排除</label>　<label><input type="checkbox" id="notifyFail" checked> 数据失败或过期</label></div><div class="modal-actions"><button class="primary-btn" id="createMonitor">创建任务</button></div></div>`);
  $("#createMonitor").addEventListener("click", () => { const tasks = JSON.parse(localStorage.getItem("zhice-monitors") || "[]"); tasks.push({ id: Date.now(), name: $("#monitorName").value, frequency: $("#monitorFreq").value, createdAt: new Date().toISOString(), conditions: state.conditions, notifications: { add: $("#notifyAdd").checked, remove: $("#notifyRemove").checked, failure: $("#notifyFail").checked } }); localStorage.setItem("zhice-monitors", JSON.stringify(tasks)); closeModal(); toast("监控任务已创建（浏览器原型）"); });
}

function openMethodology() {
  showModal(`<div class="modal-content"><span class="card-kicker">HOW IT WORKS</span><h2>职责边界与数据口径</h2><p class="lead">让语言模型擅长理解，让规则引擎擅长判断，让数据工具只提供可追溯事实。</p><div class="modal-section"><h3>1 · AI：解释意图，不挑股票</h3><p>识别实体、指标、阈值与模糊表达，生成待确认的结构化条件。AI 输出永远不直接成为入选结论。</p></div><div class="modal-section"><h3>2 · 确定性引擎：逐条比较</h3><p>对同一快照执行固定运算。相同数据与条件必定得到相同结果；缺失值按用户选择严格排除或保留降分。</p></div><div class="modal-section"><h3>3 · 金融数据工具：返回事实</h3><p>扶摇接口提供行情、估值、财务等字段。产品保留来源端点、原始字段、单位、报告期、快照时点及错误状态。</p></div><div class="modal-section"><h3>合规边界</h3><p>本产品不输出确定性涨跌预测、收益承诺或直接买卖建议。入选表示“满足当前规则”，不代表适合任何具体投资者。</p></div></div>`);
}

function openRecord() {
  showModal(`<div class="modal-content"><span class="card-kicker">AI & VALIDATION LOG</span><h2>AI 使用与验证记录</h2><p class="lead">记录构建过程中 AI 做了什么，以及哪些结论由确定性测试兜底。</p><div class="modal-section"><h3>AI 参与</h3><ul><li>需求拆解、交互文案与自然语言关键词规则设计。</li><li>页面实现、异常路径与合规措辞初稿。</li><li>未让 AI 生成候选名单或填补缺失金融字段。</li></ul></div><div class="modal-section"><h3>人工约束与修正</h3><ul><li>默认样本统一标为“构造数据”，禁止伪装为实时行情。</li><li>将“合理、稳定、改善”转成可见阈值并要求用户确认。</li><li>业务错误、缺失值和混合数据状态单独呈现，不静默降级。</li></ul></div><div class="modal-section"><h3>验证</h3><p>纯逻辑测试覆盖解析、冲突、严格/宽松缺失策略、条件变化、回测计算与导入校验；浏览器测试覆盖主链路和弹窗操作。完整记录见源码仓库 README 与 TESTING.md。</p></div></div>`);
}

function openData() {
  const sample = JSON.stringify([{ code: "600036.SH", name: "招商银行", industry: "银行", close: 42.18, revenue_yoy: 9.8, revenue_accel: 4.1, roe: 15.6, pe_ttm: 7.2, pb_mrq: 1.05, volatility_20d: 1.42, drawdown_60d: -7.8, turnover_20d: 18.6, sources: { pe_ttm: { provider: "扶摇", endpoint: "/api/a-share/valuation/snapshot", field: "pe_ttm", unit: "倍", asOf: "2026-10-09 15:00 CST" } } }], null, 2);
  showModal(`<div class="modal-content"><span class="card-kicker">DATA GATEWAY</span><h2>接入真实数据</h2><p class="lead">推荐从服务端调用扶摇后导入标准化 JSON。API Key 不应写进代码、公开仓库或共享截图。</p><div class="modal-section"><h3>方案 A · 导入完整标准化快照（推荐）</h3><div class="form-row"><div class="form-field"><label>快照时点</label><input id="importAsOf" value="2026-10-09 15:00 CST"></div><div class="form-field"><label>财报口径</label><input id="importPeriod" value="2026Q2 / TTM"></div></div><br><textarea class="import-area" id="importJson" spellcheck="false">${esc(sample)}</textarea><p>必需字段：code、name、industry、revenue_yoy、revenue_accel、roe、pe_ttm、volatility_20d、drawdown_60d。真实缺失必须写 <code>null</code>。</p><div class="modal-actions"><label class="upload-btn">选择 JSON 文件<input id="jsonFile" type="file" accept="application/json,.json" hidden></label><button class="primary-btn" id="importBtn">校验并导入</button></div></div><div class="modal-section"><h3>方案 B · 验证扶摇实时行情连接</h3><p>Key 仅驻留当前页面内存，并直接发送到 <code>fuyao.aicubes.cn</code>。此操作只刷新价格，财务指标仍保持原来源，因此结果会标记为“混合数据”。</p><div class="form-row"><div class="form-field"><label>扶摇 API Key</label><input id="apiKey" type="password" autocomplete="off" placeholder="不会保存"></div><div class="form-field"><label>&nbsp;</label><button class="upload-btn" id="connectBtn">验证并刷新价格</button></div></div><p id="dataError"></p></div></div>`);
  $("#jsonFile").addEventListener("change", async (event) => { const file = event.target.files[0]; if (file) $("#importJson").value = await file.text(); });
  $("#importBtn").addEventListener("click", () => {
    try {
      const rows = validateImportedStocks(JSON.parse($("#importJson").value));
      state.stocks = rows.map((row) => ({ ...row, returns: row.returns || [], sources: row.sources || {} })); state.dataMeta = { mode: "live", label: "用户导入 · 真实数据", asOf: $("#importAsOf").value.trim(), reportPeriod: $("#importPeriod").value.trim(), note: "已通过字段完整性校验；数据真实性与授权范围由导入方负责。" };
      state.compare.clear(); run(); renderCompareBar(); closeModal(); toast(`已导入 ${rows.length} 只股票并重新计算`);
    } catch (error) { $("#dataError").textContent = `导入失败：${error.message}`; $("#dataError").style.color = "#b14c42"; }
  });
  $("#connectBtn").addEventListener("click", async () => {
    const key = $("#apiKey").value; if (!key) return $("#dataError").textContent = "请输入 API Key";
    $("#connectBtn").disabled = true; $("#dataError").textContent = "正在连接…";
    try {
      const codes = state.stocks.map((s) => s.code).join(","); const response = await fetch(`https://fuyao.aicubes.cn/api/a-share/prices/snapshot?thscodes=${encodeURIComponent(codes)}`, { headers: { "X-api-key": key } });
      const payload = await response.json(); if (payload.code !== 0) throw new Error(`${payload.message || "业务错误"}（code=${payload.code}，request_id=${payload.request_id || "—"}）`);
      const quotes = new Map((payload.data?.item || []).map((row) => [row.thscode, row])); state.stocks = state.stocks.map((s) => ({ ...s, close: quotes.get(s.code)?.last_price ?? s.close }));
      state.dataMeta = { ...state.dataMeta, mode: "mixed", label: "扶摇实时行情 + 既有基本面（混合）", asOf: payload.data?.timestamp ? new Date(payload.data.timestamp).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : state.dataMeta.asOf, note: "价格已刷新，但基本面来源未改变；混合状态不应视为完整真实筛选。" };
      run(); closeModal(); toast("实时行情连接成功；已明确标记混合数据");
    } catch (error) { $("#dataError").textContent = `连接失败：${error.message}。未修改现有数据。`; $("#dataError").style.color = "#b14c42"; $("#connectBtn").disabled = false; }
  });
}

function parseCurrentIntent() {
  state.intent = parseIntent($("#intentInput").value); state.conditions = copy(state.intent.conditions);
  $("#parseTime").textContent = `已解析 · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  renderConflicts(); renderClarifications(); renderConditions(); updatePreview(); toast(state.intent.conflicts.length ? "发现冲突，请先处理" : "意图已转换为可执行条件");
}

$("#parseBtn").addEventListener("click", parseCurrentIntent);
$$(".examples button").forEach((button) => button.addEventListener("click", () => { $("#intentInput").value = button.textContent; parseCurrentIntent(); }));
$("#resetBtn").addEventListener("click", () => { state.intent = parseIntent(""); state.conditions = copy(state.intent.conditions); renderClarifications(); renderConditions(); updatePreview(); });
$("#missingPolicy").addEventListener("change", (event) => { state.strictMissing = event.target.value === "strict"; updatePreview(); });
$("#runBtn").addEventListener("click", () => run({ scroll: true }));
$("#sortSelect").addEventListener("change", (event) => { state.sort = event.target.value; renderResults(); });
$$("[data-tab]").forEach((button) => button.addEventListener("click", () => { state.tab = button.dataset.tab; $$('[data-tab]').forEach((b) => b.classList.toggle("active", b === button)); renderResults(); }));
$("#compareNow").addEventListener("click", openCompare); $("#saveBtn").addEventListener("click", saveStrategy); $("#backtestBtn").addEventListener("click", openBacktest); $("#monitorBtn").addEventListener("click", openMonitor);
$(".modal-close").addEventListener("click", closeModal); $("#backdrop").addEventListener("click", closeModal); document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });

document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-open]"); if (!trigger) return;
  ({ data: openData, methodology: openMethodology, record: openRecord, saved: openSaved }[trigger.dataset.open] || (() => {}))();
});

renderConflicts(); renderClarifications(); renderConditions(); run();

