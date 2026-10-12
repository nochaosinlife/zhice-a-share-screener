# 服务端部署与密钥配置

## 为什么需要服务端

GitHub Pages 是纯静态托管，无法安全保存扶摇 API Key。真实数据版本必须通过 Worker 运行，由服务端设置 `X-api-key` 请求头，浏览器只访问同源 `/api/market-data`。

## 构建

```powershell
node scripts/build-worker.mjs
node --check site-dist/dist/server/index.js
```

构建产物为 `site-dist/dist/server/index.js`，已经内嵌前端静态资源与服务端网关。不要手改生成文件。

## 必需密钥

在托管平台的“环境变量 / Secrets”中新增：

```text
HITHINK_FINANCE_API_KEY
```

值应从 `https://fuyao.aicubes.cn/admin/` 创建。不要把值发到聊天、写进 `.env.example`、提交到 GitHub 或放进浏览器。

可选变量：

```text
FUYAO_CURRENT_REPORT=2026-2
FUYAO_PREVIOUS_REPORT=2026-1
```

## 验收

- `GET /api/health`：应返回 `configured:true`。
- `GET /api/market-data`：应返回 `ok:true`、真实股票数组、基准月收益和可追溯元数据。
- 如果 Key 缺失，接口返回 `503` 和 `SERVER_KEY_MISSING`；这是预期安全行为。
- 如果扶摇返回业务错误，接口不会用构造数据替换，而是返回错误或把失败子字段保留为 `null`。

