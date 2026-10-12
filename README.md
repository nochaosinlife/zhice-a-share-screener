# 知策｜自然语言智能选股与策略解释器

知策把“经营改善、估值合理、走势相对稳定”等自然语言意图转换成可检查、可修改、可执行的数据条件，并解释每只股票为何入选、为何排除以及条件变化的影响。

> 研究辅助工具，不构成投资建议。入选仅代表满足当前规则，不代表未来上涨或适合买入。

## 在线地址

- GitHub Pages 静态演示：`https://nochaosinlife.github.io/zhice-a-share-screener/`
- 源码仓库：`https://github.com/nochaosinlife/zhice-a-share-screener`
- 服务端版本：发布后见本 README 的部署状态；只有配置合法扶摇 Key 后才会返回真实数据。

GitHub Pages 没有安全的服务端密钥环境，因此它只展示明确标识的构造数据。生产版由 Worker 同源提供网页和 `/api/market-data`，Key 仅存于服务端密钥管理。

## 核心主链路

1. 用户输入自然语言选股意图。
2. 语义层生成待确认条件，标出“合理、稳定、改善”等模糊表达。
3. 用户确认或修改阈值；阻断级冲突会禁止筛选。
4. 确定性引擎逐股、逐条件比较，不由 AI 直接挑选股票。
5. 结果展示入选、排除、缺失与逐字段证据。
6. 条件变化即时展示新增/移除候选；结果可比较、保存、回测或转为监控原型。

## 真实数据服务端

`server/fuyao.js` 按官方契约编排以下接口：

- 行情：`GET /api/a-share/prices/snapshot`
- 估值：`GET /api/a-share/valuations/snapshot`
- 财务指标：`GET /api/a-share/financials/indicators`
- 个股历史 K 线：`GET /api/a-share/prices/historical`
- 沪深 300 历史 K 线：`GET /api/a-share-index/prices/historical`

服务端计算：

- 营收增速改善：本期营业收入同比增长率减上一披露期同比增长率。
- 20 日波动率：近 20 个交易日日收益率总体标准差，百分数值，**非年化**。
- 60 日最大回撤：近 60 个交易日相对历史前高的最差回撤。
- 回测月收益：前复权日 K 按每月最后一个有效收盘价聚合。

真实数据结果携带来源、端点、原始字段、单位、报告期/时点和 `request_id`。子请求失败时对应字段保留 `null` 并列出错误，不会用演示值补齐。响应缓存 15 分钟，避免每次打开页面集中调用上游。

## 环境变量

```text
HITHINK_FINANCE_API_KEY=<server-side secret>
FUYAO_CURRENT_REPORT=2026-2       # 可选
FUYAO_PREVIOUS_REPORT=2026-1      # 可选
```

报告期省略时服务端会根据当前日期推断最近完整披露期；正式演示前仍应核对实际披露状态。禁止把真实 Key 写入仓库、客户端代码、截图或日志。

## 本地运行与验证

静态演示：

```powershell
python -m http.server 4173 --directory dist
```

构建可部署 Worker：

```powershell
node scripts/build-worker.mjs
node --check site-dist/server/index.js
```

运行测试（Node.js 18+）：

```powershell
node --test tests/logic.test.mjs tests/static.test.mjs tests/server.test.mjs
```

当前自动化测试共 19 项，覆盖主链路、冲突、缺失、回测边界、官方端点编排、派生指标、无密钥状态、客户端密钥隔离与溯源字段一致性。

## 职责边界

| 组件 | 负责 | 不负责 |
|---|---|---|
| AI / 语义层 | 理解意图、识别模糊表达、生成待确认条件 | 不直接决定股票入选，不补造金融数据 |
| 确定性引擎 | 固定比较、缺失策略、排序、变化影响 | 不预测涨跌，不生成收益承诺 |
| 服务端数据网关 | 调用扶摇、校验业务码、派生指标、缓存、保留溯源 | 不向浏览器暴露 Key，不把失败伪装成正常 |

## 已知边界

- 当前真实数据股票池为固定 12 只研究样本；行业显示来自项目内的预设分类，不是扶摇“股票基础信息”接口，因为该能力目前尚未开放。
- 财务报告期可通过环境变量指定；自动推断不替代对实际披露日期的人工核对。
- 回测未处理幸存者偏差、停牌、涨跌停、手续费和滑点。
- 保存与监控仍是浏览器原型；页面关闭后不会继续调度。
- 未配置服务端 Key 时，产品明确保留构造演示模式，不产生“真实数据候选”。

## 目录

```text
dist/                    浏览器应用与明确标识的演示数据
server/fuyao.js          扶摇服务端编排、标准化和派生指标
server/worker.js         同源 API、缓存与静态资源服务
scripts/build-worker.mjs 生成单文件 Worker 部署产物
tests/                   逻辑、静态安全与服务端测试
.openai/hosting.json     Sites Worker 项目标识
```

更多记录见 [AI_USAGE.md](./AI_USAGE.md)、[TESTING.md](./TESTING.md)、[AUDIT.md](./AUDIT.md) 和 [SERVER_DEPLOYMENT.md](./SERVER_DEPLOYMENT.md)。

