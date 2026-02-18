/**
 * Dev server — chạy trực tiếp từ source, auto restart khi file thay đổi
 *
 * Workflow:
 *   1. Start server từ Project_EE88/server/ (serve client/ + spa/ trực tiếp)
 *   2. Watch server/ — khi thay đổi → auto restart
 *   3. Watch client/, spa/ — chỉ log (refresh browser)
 *
 * Sử dụng: node scripts/dev.js  hoặc  npm run dev
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'Project_EE88');
const SERVER_DIR = path.join(ROOT, 'server');
const DEBOUNCE_MS = 500;

let debounceTimer = null;
let serverProc = null;

const cyan = (s) => '\x1b[36m' + s + '\x1b[0m';
const yellow = (s) => '\x1b[33m' + s + '\x1b[0m';
const green = (s) => '\x1b[32m' + s + '\x1b[0m';
const red = (s) => '\x1b[31m' + s + '\x1b[0m';

// ── Server ──

function startServer() {
  if (serverProc) return;

  console.log(cyan('[dev]') + ' Starting server...');
  serverProc = spawn('node', ['server.js'], {
    cwd: SERVER_DIR,
    stdio: 'inherit'
  });

  serverProc.on('exit', function (code, signal) {
    serverProc = null;
    if (signal !== 'SIGTERM' && signal !== 'SIGKILL' && code !== 0) {
      console.log(red('[dev]') + ' Server exited (code ' + code + ')');
    }
  });
}

function stopServer() {
  if (!serverProc) return;
  serverProc.kill('SIGTERM');
  serverProc = null;
}

function restartServer(trigger) {
  stopServer();
  console.log(yellow('[dev]') + ' ' + trigger + ' — restarting...');
  setTimeout(startServer, 300);
}

// ── Watch ──

function setupWatch() {
  // Watch server/ — auto restart
  fs.watch(SERVER_DIR, { recursive: true }, function (event, filename) {
    if (!filename) return;
    if (filename.includes('node_modules')) return;
    if (filename.includes('logs')) return;
    if (filename.endsWith('.db') || filename.endsWith('.db-journal') || filename.endsWith('.db-shm') || filename.endsWith('.db-wal')) return;
    if (filename.endsWith('.log')) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      restartServer('server/' + filename);
    }, DEBOUNCE_MS);
  });

  // Watch client/ + spa/ — log only (browser refresh)
  ['client', 'spa'].forEach(function (dir) {
    var fullPath = path.join(ROOT, dir);
    if (!fs.existsSync(fullPath)) return;

    fs.watch(fullPath, { recursive: true }, function (event, filename) {
      if (!filename) return;
      if (filename.includes('node_modules')) return;
      console.log(green('[dev]') + ' ' + dir + '/' + filename + ' (refresh browser)');
    });
  });
}

// ── Cleanup ──

process.on('SIGINT', function () {
  console.log('\n' + cyan('[dev]') + ' Shutting down...');
  stopServer();
  process.exit(0);
});

process.on('SIGTERM', function () {
  stopServer();
  process.exit(0);
});

// ── Main ──

console.log('');
console.log('=== EE88 Agent Hub — Dev Mode ===');
console.log('');
console.log(cyan('[dev]') + ' Server: Project_EE88/server/');
console.log(cyan('[dev]') + ' Client: Project_EE88/client/');
console.log(cyan('[dev]') + ' SPA:    Project_EE88/spa/');
console.log(cyan('[dev]') + ' server/ thay đổi → auto restart');
console.log(cyan('[dev]') + ' client/spa/ thay đổi → refresh browser');
console.log('');

startServer();
setupWatch();

process.stdin.resume();
