import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ALLOWED_ROOT_DIRS = new Set([
  ".githooks",
  ".github",
  "backend",
  "docs",
  "firmware",
  "public",
  "scripts",
  "src",
]);

const ALLOWED_ROOT_FILES = new Set([
  ".gitattributes",
  ".gitignore",
  ".prettierignore",
  ".prettierrc",
  "DESIGN.md",
  "Procfile",
  "README.md",
  "app.json",
  "components.json",
  "composer.json",
  "composer.lock",
  "eslint.config.js",
  "package-lock.json",
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "vitest.config.ts",
]);

const FORBIDDEN_DIRS = new Set([
  "node_modules",
  "vendor",
  "dist",
  ".output",
  ".nitro",
  ".vinxi",
  ".wrangler",
  ".tanstack",
  "coverage",
  "anti-slop",
  "scratch",
  "tmp",
  "temp",
  "sandbox",
]);

const FORBIDDEN_BASENAMES = new Set([
  ".ds_store",
  "thumbs.db",
  "ehthumbs.db",
  "desktop.ini",
  ".netrc",
  "_netrc",
  "agents.md",
  "claude.md",
  "roadmap.md",
]);

const FORBIDDEN_EXTENSIONS = [
  ".tar.gz",
  ".sql.gz",
  ".pem",
  ".key",
  ".p12",
  ".pfx",
  ".jks",
  ".secret",
  ".secrets",
  ".log",
  ".tmp",
  ".temp",
  ".bak",
  ".orig",
  ".old",
  ".swp",
  ".swo",
  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".tgz",
  ".dump",
  ".sqlite",
  ".sqlite3",
  ".db",
];

const SIZE_EXEMPT_BASENAMES = new Set(["package-lock.json"]);
const MAX_FILE_BYTES = 1536 * 1024;
const MAX_SECRET_SCAN_BYTES = 512 * 1024;

const SECRET_RULES = [
  { name: "Heroku OAuth token (HRKU-)", re: /HRKU-[A-Za-z0-9_-]{20,}/ },
  {
    name: "GitHub token (ghp_/github_pat_)",
    re: /(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/,
  },
  { name: "Private key PEM block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    name: "Non-localhost DB credential URI",
    re: /\bmysql:\/\/[^:\s/]+:[^@\s/]+@(?!localhost\b|127\.0\.0\.1\b)[^\s/'"]+/i,
  },
];

const DOCS_FORBIDDEN_RULES = [
  { name: "Non-project term (anti-ai-slop)", re: /\banti[- ]?ai[- ]?slop\b/i },
  { name: "Non-project rule reference (anti-slop)", re: /\banti-slop\b/i },
  { name: "Internal agent rule file (AGENTS.md)", re: /\bAGENTS\.md\b/ },
  { name: "Internal agent rule file (CLAUDE.md)", re: /\bCLAUDE\.md\b/ },
  { name: "Internal roadmap file (roadmap.md)", re: /\broadmap\.md\b/i },
  { name: "Internal prompt design file (DESIGN.md)", re: /\bDESIGN\.md\b/ },
  { name: "Scratch script reference (test_task14_simulation)", re: /\btest_task14_simulation\b/i },
  { name: "Scratch workspace reference (scratch/)", re: /(?:^|[\s`"'(])scratch\//i },
];

function gitLines(args) {
  const out = execFileSync("git", args, { encoding: "utf8" });
  return out
    .split(/\r?\n/)
    .map((s) => s.trim().replace(/\\/g, "/"))
    .filter(Boolean);
}

function resolveCandidateFiles(stagedOnly) {
  if (stagedOnly) {
    return gitLines(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
  }
  const tracked = gitLines(["ls-files"]);
  const stagedAdded = gitLines(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
  const stagedDeleted = new Set(gitLines(["diff", "--cached", "--name-only", "--diff-filter=D"]));
  const combined = new Set([...tracked, ...stagedAdded]);
  for (const deletedPath of stagedDeleted) {
    combined.delete(deletedPath);
  }
  return [...combined].sort();
}

function checkRootAllowlist(normPath) {
  const segments = normPath.split("/");
  const top = segments[0];
  if (segments.length > 1) {
    if (!ALLOWED_ROOT_DIRS.has(top)) {
      return `Unexpected root folder '${top}/'. Ignore it in .gitignore or register it in ALLOWED_ROOT_DIRS inside scripts/check-repo-hygiene.mjs.`;
    }
    return null;
  }
  if (!ALLOWED_ROOT_FILES.has(top)) {
    return `Unexpected root file '${top}'. Ignore it in .gitignore or register it in ALLOWED_ROOT_FILES inside scripts/check-repo-hygiene.mjs.`;
  }
  return null;
}

function checkForbiddenPath(normPath) {
  const segments = normPath.toLowerCase().split("/");
  for (const dir of segments.slice(0, -1)) {
    if (FORBIDDEN_DIRS.has(dir)) {
      return `Forbidden directory '${dir}/' cannot be committed or pushed.`;
    }
  }
  const baseLower = segments[segments.length - 1];
  if (/^\.env(\..+)?$/.test(baseLower) && !baseLower.endsWith(".example")) {
    return `Forbidden environment secret file '${normPath}'. Only *.example templates may be tracked.`;
  }
  if (FORBIDDEN_BASENAMES.has(baseLower)) {
    return `Forbidden local/OS file '${normPath}' must stay untracked.`;
  }
  for (const ext of FORBIDDEN_EXTENSIONS) {
    if (baseLower.endsWith(ext)) {
      return `Forbidden extension '${ext}' on '${normPath}' cannot be committed or pushed.`;
    }
  }
  return null;
}

function checkDocsContentHygiene(normPath, text) {
  const isDocsFile =
    normPath.startsWith("docs/docs/") ||
    normPath.startsWith("docs/src/") ||
    normPath === "docs/docusaurus.config.ts" ||
    normPath === "docs/sidebars.ts";
  if (!isDocsFile) return [];

  const issues = [];
  for (const rule of DOCS_FORBIDDEN_RULES) {
    if (rule.re.test(text)) {
      issues.push(`Forbidden non-project/internal reference in docs: ${rule.name}`);
    }
  }
  return issues;
}

function checkFileSizeAndSecrets(normPath) {
  const fullPath = path.resolve(process.cwd(), normPath);
  if (!existsSync(fullPath)) return [];
  const issues = [];
  const stat = statSync(fullPath);
  if (!stat.isFile()) return [];

  const baseName = path.posix.basename(normPath);
  if (!SIZE_EXEMPT_BASENAMES.has(baseName) && stat.size > MAX_FILE_BYTES) {
    const sizeKb = (stat.size / 1024).toFixed(1);
    issues.push(`File size ${sizeKb} KB exceeds 1536 KB limit.`);
  }

  if (normPath === "scripts/check-repo-hygiene.mjs" || stat.size > MAX_SECRET_SCAN_BYTES) {
    return issues;
  }

  const buf = readFileSync(fullPath);
  if (buf.includes(0)) {
    return issues;
  }
  const text = buf.toString("utf8");
  for (const rule of SECRET_RULES) {
    if (rule.re.test(text)) {
      issues.push(`Potential secret detected: ${rule.name}`);
    }
  }
  issues.push(...checkDocsContentHygiene(normPath, text));
  return issues;
}

function main() {
  const args = new Set(process.argv.slice(2));
  const stagedOnly = args.has("--staged");
  const modeLabel = stagedOnly ? "staged" : "strict";

  const files = resolveCandidateFiles(stagedOnly);
  const violations = [];

  for (const filePath of files) {
    const rootErr = checkRootAllowlist(filePath);
    if (rootErr) violations.push({ filePath, reason: rootErr });

    const forbiddenErr = checkForbiddenPath(filePath);
    if (forbiddenErr) violations.push({ filePath, reason: forbiddenErr });

    for (const reason of checkFileSizeAndSecrets(filePath)) {
      violations.push({ filePath, reason });
    }
  }

  if (stagedOnly) {
    const untracked = gitLines(["ls-files", "--others", "--exclude-standard"]);
    if (untracked.length > 0) {
      console.warn(
        `[repo-hygiene] Notice: ${untracked.length} untracked non-ignored item(s) remain in workspace:\n  - ${untracked.join("\n  - ")}`,
      );
    }
  }

  if (violations.length > 0) {
    console.error(
      `[repo-hygiene] BLOCKED (${modeLabel}): ${violations.length} violation(s) found:`,
    );
    for (const v of violations) {
      console.error(`  - ${v.filePath}: ${v.reason}`);
    }
    process.exit(1);
  }

  console.log(`[repo-hygiene] PASSED (${modeLabel}): verified ${files.length} file(s).`);
}

main();
