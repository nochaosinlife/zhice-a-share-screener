import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../dist/app.js", import.meta.url), "utf8");

test("页面包含主链路和后续动作", () => {
  for (const phrase of ["解析意图", "确认可执行条件", "候选清单", "保存策略", "快速回测", "转为监控"]) assert.match(html, new RegExp(phrase));
});

test("合规声明可见", () => {
  assert.match(html, /不做涨跌预测/);
  assert.match(html, /不构成投资建议/);
});

test("数据异常不会静默回退", () => {
  assert.match(app, /未修改现有数据/);
  assert.match(app, /SERVER_KEY_MISSING/);
  assert.match(app, /缺失/);
});

test("API Key 不再进入浏览器，前端只访问同源服务端网关", () => {
  assert.doesNotMatch(app, /X-api-key|id="apiKey"|fuyao\.aicubes\.cn\/api/);
  assert.match(app, /fetch\("\/api\/market-data"/);
});
