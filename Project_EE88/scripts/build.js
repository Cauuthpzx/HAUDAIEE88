/**
 * Build script — copy source → dist
 * Giữ nguyên: node_modules, logs, .env, database/*.db*
 *
 * Chạy: npm run build (từ root)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// ── Helpers ──────────────────────────────────────────

function rmSync(p) {
  try {
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
  } catch (e) {
    console.log(`[build] WARN: Cannot remove ${path.basename(p)} — ${e.code}`);
  }
}

function copyDir(src, dest, opts) {
  const excludeDirs = (opts && opts.excludeDirs) || [];
  const excludeExts = (opts && opts.excludeExts) || [];

  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (excludeDirs.includes(entry.name)) continue;

    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(s, d, { excludeExts });
    } else {
      if (excludeExts.some(ext => entry.name.endsWith(ext))) continue;
      try {
        fs.copyFileSync(s, d);
      } catch (e) {
        console.log(`[build] WARN: Cannot copy ${entry.name} — ${e.code}`);
      }
    }
  }
}

// ── Build Steps ──────────────────────────────────────

const t0 = Date.now();

// 1. Đảm bảo dist/ tồn tại
if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });

// 2. Clean dist/server (giữ node_modules, logs, .env, database/*.db*)
console.log('[build] Cleaning dist/server...');
const distServer = path.join(DIST, 'server');
if (fs.existsSync(distServer)) {
  const KEEP = ['node_modules', 'logs', '.env'];
  for (const entry of fs.readdirSync(distServer, { withFileTypes: true })) {
    if (KEEP.includes(entry.name)) continue;
    if (entry.name === 'database') {
      // Chỉ xóa non-db files trong database/
      const dbDir = path.join(distServer, 'database');
      for (const f of fs.readdirSync(dbDir)) {
        if (!f.endsWith('.db') && !f.endsWith('.db-shm') && !f.endsWith('.db-wal')) {
          rmSync(path.join(dbDir, f));
        }
      }
      continue;
    }
    rmSync(path.join(distServer, entry.name));
  }
}

// 3. Clean dist/client
console.log('[build] Cleaning dist/client...');
rmSync(path.join(DIST, 'client'));

// 4. Copy server → dist/server
console.log('[build] Copying server...');
copyDir(
  path.join(ROOT, 'server'),
  distServer,
  { excludeDirs: ['node_modules', '.env', 'logs'], excludeExts: ['.db', '.db-shm', '.db-wal'] }
);

// 5. Copy client → dist/client
console.log('[build] Copying client...');
copyDir(path.join(ROOT, 'client'), path.join(DIST, 'client'));

// 6. Copy captcha → dist/captcha
console.log('[build] Copying captcha...');
copyDir(path.join(ROOT, 'captcha'), path.join(DIST, 'captcha'));

const duration = Date.now() - t0;
console.log(`[build] Done! ${duration}ms — Nodemon sẽ tự restart.`);
