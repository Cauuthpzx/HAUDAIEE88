/**
 * Dev server — auto-restart khi server files thay đổi
 *
 * - Chạy server trực tiếp từ source (không cần build)
 * - Client changes: chỉ cần refresh browser
 * - Server changes: tự restart
 *
 * Sử dụng: node scripts/dev.js
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SERVER_DIR = path.resolve(__dirname, '..', 'Project_EE88', 'server');
const SERVER_ENTRY = path.join(SERVER_DIR, 'server.js');

let serverProcess = null;
let restartTimer = null;

function startServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }

  console.log('\x1b[36m[dev]\x1b[0m Starting server...');
  serverProcess = spawn('node', [SERVER_ENTRY], {
    cwd: SERVER_DIR,
    stdio: 'inherit'
  });

  serverProcess.on('exit', function (code, signal) {
    if (signal !== 'SIGTERM' && signal !== 'SIGKILL') {
      console.log('\x1b[31m[dev]\x1b[0m Server exited (code: ' + code + ')');
    }
    serverProcess = null;
  });
}

function restart() {
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(function () {
    console.log('\x1b[33m[dev]\x1b[0m Restarting...');
    startServer();
  }, 300);
}

// Watch server directory
fs.watch(SERVER_DIR, { recursive: true }, function (event, filename) {
  if (!filename) return;
  if (filename.includes('node_modules')) return;
  if (filename.includes('logs')) return;
  if (filename.endsWith('.log')) return;
  console.log('\x1b[33m[dev]\x1b[0m Changed: server/' + filename);
  restart();
});

// Watch client directory
var CLIENT_DIR = path.resolve(__dirname, '..', 'Project_EE88', 'client');
fs.watch(CLIENT_DIR, { recursive: true }, function (event, filename) {
  if (!filename) return;
  console.log('\x1b[32m[dev]\x1b[0m Changed: client/' + filename + ' (refresh browser)');
});

console.log('\x1b[36m[dev]\x1b[0m Watching source files...');
console.log('\x1b[36m[dev]\x1b[0m Server changes → auto restart');
console.log('\x1b[36m[dev]\x1b[0m Client changes → refresh browser');
console.log('');

startServer();

// Graceful shutdown
process.on('SIGINT', function () {
  console.log('\n\x1b[36m[dev]\x1b[0m Shutting down...');
  if (serverProcess) serverProcess.kill();
  process.exit();
});

process.on('SIGTERM', function () {
  if (serverProcess) serverProcess.kill();
  process.exit();
});
