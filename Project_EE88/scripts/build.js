/**
 * Build script — copy source → dist/, minify JS/CSS
 *
 * Chạy: node scripts/build.js [--no-minify]
 *   --no-minify  Chỉ copy, không minify (nhanh hơn cho dev)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const NO_MINIFY = process.argv.includes('--no-minify');

const EXCLUDE_EXTS = new Set(['.db', '.db-shm', '.db-wal']);
const EXCLUDE_DIRS = new Set(['node_modules', 'logs', '.env']);

// Chỉ minify JS/CSS custom — không động vendor (lib/)
const MINIFY_JS_DIRS = new Set(['js', 'pages']);
const MINIFY_CSS_DIRS = new Set(['css']);

let minStats = { js: 0, css: 0, jsBytes: 0, cssBytes: 0 };

// ── Helpers ──

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

// ── Minify ──

async function minifyDir(dir) {
  if (!fs.existsSync(dir)) return;
  const { minify: terserMinify } = require('terser');
  const CleanCSS = require('clean-css');
  const cleanCss = new CleanCSS({ level: 1 });

  await walkMinify(dir, terserMinify, cleanCss);
}

async function walkMinify(dir, terserMinify, cleanCss) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Chỉ minify trong các thư mục cho phép
      if (MINIFY_JS_DIRS.has(entry.name) || MINIFY_CSS_DIRS.has(entry.name)) {
        await walkMinify(full, terserMinify, cleanCss);
      } else if (!['lib', 'node_modules'].includes(entry.name)) {
        // Recursive vào subdir (nhưng skip lib/ và node_modules/)
        await walkMinify(full, terserMinify, cleanCss);
      }
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();

    if (ext === '.js' && !entry.name.endsWith('.min.js')) {
      try {
        const code = fs.readFileSync(full, 'utf8');
        const result = await terserMinify(code, {
          compress: { drop_console: false, passes: 2 },
          mangle: true,
          output: { comments: false }
        });
        if (result.code) {
          const saved = code.length - result.code.length;
          fs.writeFileSync(full, result.code);
          minStats.js++;
          minStats.jsBytes += saved;
        }
      } catch (e) {
        console.warn(
          `  [warn] Minify JS failed: ${path.relative(DIST, full)} — ${e.message}`
        );
      }
    }

    if (ext === '.css' && !entry.name.endsWith('.min.css')) {
      try {
        const code = fs.readFileSync(full, 'utf8');
        const result = cleanCss.minify(code);
        if (result.styles) {
          const saved = code.length - result.styles.length;
          fs.writeFileSync(full, result.styles);
          minStats.css++;
          minStats.cssBytes += saved;
        }
      } catch (e) {
        console.warn(
          `  [warn] Minify CSS failed: ${path.relative(DIST, full)} — ${e.message}`
        );
      }
    }
  }
}

// ── Main ──

async function build() {
  const t0 = Date.now();

  // Clean dist (preserve node_modules, logs, .env, .db files)
  console.log('[build] Cleaning dist/server...');
  cleanDir(
    path.join(DIST, 'server'),
    new Set(['node_modules', 'logs', '.env'])
  );
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

  const copyTime = Date.now() - t0;
  console.log(`[build] Copy xong — ${copyTime}ms`);

  // Minify JS/CSS (chỉ custom code, skip lib/)
  if (!NO_MINIFY) {
    console.log('[build] Minifying JS/CSS...');
    const t1 = Date.now();
    await minifyDir(path.join(DIST, 'client'));
    await minifyDir(path.join(DIST, 'spa'));
    const minTime = Date.now() - t1;
    console.log(`[build] Minify xong — ${minTime}ms`);
    console.log(
      `  JS:  ${minStats.js} files, saved ${(minStats.jsBytes / 1024).toFixed(1)} KB`
    );
    console.log(
      `  CSS: ${minStats.css} files, saved ${(minStats.cssBytes / 1024).toFixed(1)} KB`
    );
  } else {
    console.log('[build] Skipping minify (--no-minify)');
  }

  console.log(`[build] Done! ${Date.now() - t0}ms — Nodemon sẽ tự restart.`);
}

build().catch((err) => {
  console.error('[build] FATAL:', err);
  process.exit(1);
});
