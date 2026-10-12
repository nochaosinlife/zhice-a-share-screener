import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(root, "site-dist");
const files = [
  ["/index.html", "dist/index.html", "text/html; charset=utf-8"],
  ["/styles.css", "dist/styles.css", "text/css; charset=utf-8"],
  ["/app.js", "dist/app.js", "text/javascript; charset=utf-8"],
  ["/logic.js", "dist/logic.js", "text/javascript; charset=utf-8"],
  ["/data.js", "dist/data.js", "text/javascript; charset=utf-8"],
];

const assets = {};
for (const [urlPath, filePath, type] of files) {
  assets[urlPath] = { body: await readFile(resolve(root, filePath), "utf8"), type };
}
const fuyao = (await readFile(resolve(root, "server/fuyao.js"), "utf8"))
  .replaceAll(/^export\s+/gm, "");
const worker = (await readFile(resolve(root, "server/worker.js"), "utf8"))
  .replace(/^import .*?;\r?\n\r?\n/, "")
  .replace("export function createWorker", "function createWorker");
const bundle = `${fuyao}\n\n${worker}\n\nconst ASSETS = ${JSON.stringify(assets)};\nexport default createWorker(ASSETS);\n`;

await rm(outputRoot, { recursive: true, force: true });
await mkdir(resolve(outputRoot, "server"), { recursive: true });
await mkdir(resolve(outputRoot, ".openai"), { recursive: true });
await writeFile(resolve(outputRoot, "server/index.js"), bundle);
await writeFile(resolve(outputRoot, ".openai/hosting.json"), JSON.stringify({ project_id: "appgprj_6acc8dbce8f081918fe04fd0a76cb8fa" }, null, 2) + "\n");
console.log(`Built ${files.length} assets into site-dist/server/index.js`);
