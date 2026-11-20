import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = process.cwd();
const outputPublicDir = path.join(rootDir, ".output", "public");
const serverEntryPath = path.join(rootDir, ".output", "server", "index.mjs");
const backendSrcDir = path.join(rootDir, "backend", "dipo_api");
const backendDestDir = path.join(outputPublicDir, "dipo_api");

const PUBLIC_PHP_FILES = new Set([
  "db.php",
  "get_data.php",
  "get_live_status.php",
  "simpan_data.php",
  "update_config.php",
  "export_csv.php",
  "export_excel.php",
]);

const HTACCESS_CONTENT = `DirectoryIndex index.php index.html
DirectorySlash Off
Options -Indexes

<FilesMatch "^(db\\.php|migrate\\.php|.*\\.sql|\\..*)$">
  Require all denied
</FilesMatch>

<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set X-Frame-Options "SAMEORIGIN"
</IfModule>

<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /

  # Redirect HTTP -> HTTPS on Heroku router
  RewriteCond %{HTTP:X-Forwarded-Proto} =http
  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

  # Block direct HTTP access to internal helpers, migrations, SQL dumps, and dotfiles
  RewriteRule ^dipo_api/(?:db\\.php|migrate\\.php|.*\\.sql|\\..*)$ - [F,L]

  # Serve PHP backend endpoints directly
  RewriteRule ^dipo_api/ - [L]

  # Serve static assets directly
  RewriteCond %{REQUEST_FILENAME} -f
  RewriteRule ^ - [L]

  # Serve pre-rendered /dashboard without directory trailing-slash redirect
  RewriteRule ^dashboard(?:/.*)?$ /dashboard/index.html [L]

  # Root & SPA fallback
  RewriteRule ^ /index.html [L]
</IfModule>
`;

async function prerenderRoute(server, routePath, outFile) {
  const req = new Request(`http://localhost${routePath}`);
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const res = await server.fetch(req, {}, ctx);
  if (!res.ok) {
    throw new Error(`Failed to pre-render ${routePath}: HTTP ${res.status}`);
  }
  const html = await res.text();
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, html, "utf8");
  console.log(
    `[heroku-prep] Pre-rendered ${routePath} -> ${path.relative(rootDir, outFile)} (${html.length} bytes)`,
  );
}

async function main() {
  const serverMod = await import(pathToFileURL(serverEntryPath).href);
  const server = serverMod.default;
  if (!server || typeof server.fetch !== "function") {
    throw new Error(`Invalid SSR entry at ${serverEntryPath}`);
  }

  await mkdir(outputPublicDir, { recursive: true });
  await prerenderRoute(server, "/", path.join(outputPublicDir, "index.html"));
  await prerenderRoute(server, "/dashboard", path.join(outputPublicDir, "dashboard", "index.html"));

  await rm(backendDestDir, { recursive: true, force: true });
  await mkdir(backendDestDir, { recursive: true });
  await cp(backendSrcDir, backendDestDir, {
    recursive: true,
    force: true,
    filter: (src) => src === backendSrcDir || PUBLIC_PHP_FILES.has(path.basename(src)),
  });
  console.log(
    `[heroku-prep] Copied ${PUBLIC_PHP_FILES.size} whitelisted PHP files -> ${path.relative(rootDir, backendDestDir)}`,
  );

  const htaccessPath = path.join(outputPublicDir, ".htaccess");
  await writeFile(htaccessPath, HTACCESS_CONTENT, "utf8");
  console.log(`[heroku-prep] Generated ${path.relative(rootDir, htaccessPath)}`);

  const pkgCheck = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8"));
  console.log(`[heroku-prep] Ready for Heroku deployment (${pkgCheck.name})`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[heroku-prep] Error:", err);
    process.exit(1);
  });
