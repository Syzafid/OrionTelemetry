import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(__dirname, "..");
const sourceDir = path.join(docsRoot, "docs");
const targetDir = path.join(docsRoot, "static", "raw-md");

function copyMarkdownRecursive(srcDir, dstDir) {
  let count = 0;
  for (const entry of readdirSync(srcDir)) {
    const srcPath = path.join(srcDir, entry);
    const dstPath = path.join(dstDir, entry);
    const stat = statSync(srcPath);
    if (stat.isDirectory()) {
      count += copyMarkdownRecursive(srcPath, dstPath);
    } else if (entry.endsWith(".md") || entry.endsWith(".mdx")) {
      mkdirSync(path.dirname(dstPath), { recursive: true });
      cpSync(srcPath, dstPath);
      count++;
    }
  }
  return count;
}

if (existsSync(targetDir)) {
  rmSync(targetDir, { recursive: true, force: true });
}
mkdirSync(targetDir, { recursive: true });

const copied = copyMarkdownRecursive(sourceDir, targetDir);
console.log(`[sync-raw-md] Synced ${copied} markdown file(s) -> static/raw-md/`);
