/**
 * Build script — copy source → dist/
 * Chạy: node scripts/build.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const EXCLUDE_EXTS = new Set(['.db', '.db-shm', '.db-wal']);
const EXCLUDE_DIRS = new Set(['node_modules', 'logs', '.env']);

function cleanDir(dir, preserveSet) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    if (preserveSet && preserveSet.has(entry)) continue;
    const full = path.join(dir, entry);
    fs.rmSync(full, { recursive: true, force: true });
  }
}

function copyDir(src, dest, opts = {}) {
  const { excludeExts, excludeDirs } = opts;
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (excludeDirs && excludeDirs.has(entry.name)) continue;

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, opts);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (excludeExts && excludeExts.has(ext)) continue;
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const t0 = Date.now();

// Clean dist (preserve node_modules, logs, .env, .db files inside database/)
console.log('[build] Cleaning dist/server...');
cleanDir(path.join(DIST, 'server'), new Set(['node_modules', 'logs', '.env']));
console.log('[build] Cleaning dist/client...');
cleanDir(path.join(DIST, 'client'));
console.log('[build] Cleaning dist/spa...');
cleanDir(path.join(DIST, 'spa'));

// Copy source → dist
console.log('[build] Copying server...');
copyDir(path.join(ROOT, 'server'), path.join(DIST, 'server'), {
  excludeExts: EXCLUDE_EXTS,
  excludeDirs: EXCLUDE_DIRS
});

console.log('[build] Copying client...');
copyDir(path.join(ROOT, 'client'), path.join(DIST, 'client'), {
  excludeDirs: new Set(['node_modules'])
});

console.log('[build] Copying spa...');
copyDir(path.join(ROOT, 'spa'), path.join(DIST, 'spa'));

console.log('[build] Copying captcha...');
copyDir(path.join(ROOT, 'captcha'), path.join(DIST, 'captcha'));

console.log(`[build] Done! ${Date.now() - t0}ms — Nodemon sẽ tự restart.`);
