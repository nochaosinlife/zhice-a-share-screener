# 知策｜自然语言智能选股与策略解释器

知策把“经营改善、估值合理、走势相对稳定”一类自然语言意图，转换成用户可检查、可修改、可重复执行的数据条件。产品提供条件澄清、冲突识别、确定性筛选、逐股入选/排除依据、条件变化影响、比较、保存、回测与监控任务原型。

> 研究辅助工具，不构成投资建议。产品不输出确定性涨跌预测、收益承诺或直接买卖建议。

## 在线产品

- GitHub Pages：`https://nochaosinlife.github.io/zhice-a-share-screener/`
- 源码仓库：`https://github.com/nochaosinlife/zhice-a-share-screener`
- `.github/workflows/pages.yml` 会在 `main` 分支更新后自动部署 `dist/`。

## 本地启动

这是一个无构建依赖的静态应用，需要通过 HTTP 服务打开，不能直接双击 `index.html`（ES Module 会受浏览器文件协议限制）。

```powershell
cd C:\Users\56281\Documents\Codex\2026-10-12\qing
python -m http.server 4173 --directory dist
```

然后访问 `http://localhost:4173`。

测试需要 Node.js 18+：

```powershell
node --test tests/logic.test.mjs tests/static.test.mjs
node --check dist/app.js
node --check dist/logic.js
node --check dist/data.js
```

## 核心主链路

1. 用户输入自然语言选股想法。
2. 解析器把语言映射为结构化指标与阈值，并标出“合理、稳定、改善”等模糊词。
3. 用户确认或修改口径；冲突条件会阻断执行。
4. 确定性引擎逐股、逐条件比较，不由 AI 直接挑选股票。
5. 结果区展示入选、排除、数据缺失与逐字段证据。
6. 条件变化即时显示新增/移除候选；结果可继续比较、保存、回测或转成监控任务。

## 职责边界

| 组件 | 负责 | 不负责 |
|---|---|---|
| AI / 语义层 | 理解意图、识别模糊表达、生成待确认条件 | 不直接决定股票入选，不补造金融数据 |
| 确定性筛选引擎 | 固定运算、缺失策略、排序、变化影响 | 不预测涨跌，不解释用户风险偏好 |
| 金融数据工具 | 返回行情、估值、财务、历史序列和元数据 | 不生成投资建议 |

相同数据、条件和缺失策略必须产生相同结果。核心逻辑位于 `dist/logic.js`，不依赖模型随机输出。

## 数据来源与接入

默认内置 12 只股票的**构造演示快照**，只用于验证产品交互，页面会持续显示“审计演示快照 · 构造数据”，不会把它伪装为真实行情。

真实数据有两条接入路径：

1. 推荐：服务端调用扶摇接口后，导入标准化 JSON。导入器要求字段完整，缺失值必须显式为 `null`。
2. 调试：在页面内输入扶摇 API Key，仅在当前页面内存中直接验证行情接口。Key 不保存；该路径只刷新价格，因此会明确标为“混合数据”。

扶摇接口契约：

- Base URL：`https://fuyao.aicubes.cn`
- 鉴权请求头：`X-api-key`
- 行情：`/api/a-share/prices/snapshot`
- 财务指标：`/api/a-share/financials/indicators`
- 估值：`/api/a-share/valuation/snapshot`
- 历史行情：`/api/a-share/prices/history`
- 响应使用统一业务信封；即使 HTTP 为 200，也必须检查 `code`、`message` 与 `request_id`。

产品不会在仓库、日志或 Local Storage 中保存 API Key。

## 主要指标口径

- 营收同比：最近报告期营业收入同比增长率，单位 `%`。
- 营收增速改善：本期营收同比减上期营收同比，单位“百分点”。
- 加权 ROE：最近报告期加权净资产收益率，单位 `%`。
- PE-TTM：最新总市值除以过去四季度归母净利润，单位“倍”。
- 20 日波动率：日收益率标准差年化，产品演示阈值使用 `%`。
- 60 日最大回撤下限：区间内相对前高的最大跌幅，单位 `%`，例如 `>= -15%`。

每只股票的证据抽屉展示来源、端点、原始字段、单位、报告期/时点以及通过、失败或缺失状态。

## 环境变量

静态原型不需要环境变量。生产化时应由服务端密钥管理注入：

```text
HITHINK_FINANCE_API_KEY=<server-side secret>
```

禁止把真实 Key 写进 `.env` 后提交到公开仓库，也不要把 Key 放在客户端构建产物中。

## 已知边界与未做事项

- 自然语言解析使用可审计的关键词与数值规则，不是远程大模型调用；这样可在无模型密钥时稳定运行。
- 默认股票池是用于评审的 12 只构造样本，不是完整沪深 300。
- 浏览器直连扶摇依赖其 CORS 策略；失败会保留旧数据并显示真实错误。
- 回测是 12 个月等权原型，未处理幸存者偏差、复权、停牌、涨跌停、手续费和滑点。
- 保存与监控任务存储于浏览器 Local Storage。监控不具备页面关闭后的服务端定时执行能力。
- 生产版应增加服务端数据编排、交易日调度、全量股票池、缓存、权限审计与数据许可证控制。

## 文档

- [AI 使用与验证记录](./AI_USAGE.md)
- [测试说明](./TESTING.md)
- [最终需求符合性审计](./AUDIT.md)

## 目录

```text
dist/
  index.html     页面结构
  styles.css     响应式视觉样式
  app.js         产品交互与数据接入
  logic.js       可测试的纯筛选逻辑
  data.js        明确标注的构造演示数据
tests/
  logic.test.mjs
  static.test.mjs
.openai/hosting.json
```

