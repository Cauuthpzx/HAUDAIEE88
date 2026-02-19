/**
 * Captcha Solver — Pure JS (Tesseract.js OCR + Node.js crypto RSA)
 *
 * Thay thế Python solver — không cần dependency ngoài Node.js
 *
 * Flow:
 *   1. Tạo HTTP session (keepAlive, cookie jar)
 *   2. Lấy RSA public key từ EE88 (POST /agent/login scene=init)
 *   3. RSA encrypt password (Node crypto PKCS1v1.5)
 *   4. Lấy captcha image (GET /agent/captcha)
 *   5. OCR giải captcha (Tesseract.js WASM)
 *   6. Post-OCR correction → validate → submit login
 *   7. Retry tối đa 10 lần nếu captcha sai
 */

const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const sharp = require('sharp');
const { createWorker } = require('tesseract.js');
const { createLogger } = require('../utils/logger');

const log = createLogger('solver');

// ── Shared HTTP agents (keepAlive = reuse TCP connection) ──
const keepAliveHttpAgent = new http.Agent({ keepAlive: true, maxSockets: 10 });
const keepAliveHttpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 10
});

// ── Random Chrome User-Agent (2025-2026) ──
const UA_VERSIONS = [
  '130.0.0.0',
  '131.0.0.0',
  '132.0.0.0',
  '133.0.0.0',
  '134.0.0.0',
  '135.0.0.0'
];
function randomUA() {
  const v = UA_VERSIONS[Math.floor(Math.random() * UA_VERSIONS.length)];
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`;
}

// ── HTTP Session (cookie jar + keepAlive) ──
class HttpSession {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.userAgent = randomUA();
    this.cookies = {};
    this.isHttps = baseUrl.startsWith('https');
  }

  _getHeaders(extra) {
    const cookieStr = Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    return {
      'User-Agent': this.userAgent,
      'X-Requested-With': 'XMLHttpRequest',
      ...(cookieStr ? { Cookie: cookieStr } : {}),
      ...extra
    };
  }

  _parseCookies(res) {
    const sc = res.headers['set-cookie'];
    if (!sc) return;
    const arr = Array.isArray(sc) ? sc : [sc];
    for (const c of arr) {
      const [kv] = c.split(';');
      const eq = kv.indexOf('=');
      if (eq > 0) {
        this.cookies[kv.substring(0, eq).trim()] = kv.substring(eq + 1).trim();
      }
    }
  }

  _agentOpts() {
    return this.isHttps
      ? { httpAgent: keepAliveHttpAgent, httpsAgent: keepAliveHttpsAgent }
      : { httpAgent: keepAliveHttpAgent };
  }

  async get(path, opts = {}) {
    const res = await axios.get(this.baseUrl + path, {
      headers: this._getHeaders(opts.headers),
      responseType: opts.responseType || 'json',
      timeout: opts.timeout || 8000,
      maxRedirects: 5,
      validateStatus: () => true,
      ...this._agentOpts()
    });
    this._parseCookies(res);
    return res;
  }

  async postJSON(path, data, opts = {}) {
    const res = await axios.post(this.baseUrl + path, data, {
      headers: this._getHeaders({
        'Content-Type': 'application/json',
        ...opts.headers
      }),
      timeout: opts.timeout || 8000,
      maxRedirects: 5,
      validateStatus: () => true,
      ...this._agentOpts()
    });
    this._parseCookies(res);
    return res;
  }

  getCookieString() {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
}

// ── RSA PKCS1v1.5 Encrypt ──
function rsaEncrypt(password, publicKeyPem) {
  let pem = publicKeyPem;
  if (pem.includes('-----BEGIN') && !pem.includes('\n')) {
    pem = pem
      .replace('-----BEGIN PUBLIC KEY-----', '-----BEGIN PUBLIC KEY-----\n')
      .replace('-----END PUBLIC KEY-----', '\n-----END PUBLIC KEY-----');
  }
  return crypto
    .publicEncrypt(
      { key: pem, padding: crypto.constants.RSA_PKCS1_PADDING },
      Buffer.from(password, 'utf8')
    )
    .toString('base64');
}

// ── OCR Engine (Tesseract.js — pure WASM, singleton) ──
let _worker = null;
let _workerReady = false;
let _initPromise = null;

async function getOCRWorker() {
  if (_worker && _workerReady) return _worker;
  // Tránh init đồng thời (singleton promise)
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    log.info('Khởi tạo OCR engine (Tesseract.js)...');
    _worker = await createWorker('eng', 1, { logger: () => {} });
    await _worker.setParameters({
      tessedit_char_whitelist: '0123456789abcdefghijklmnopqrstuvwxyz',
      tessedit_pageseg_mode: '7' // single text line
    });
    _workerReady = true;
    log.ok('OCR engine sẵn sàng');
    return _worker;
  })();

  return _initPromise;
}

// ── Image Preprocessing (sharp) ──
async function preprocessCaptcha(imageBuffer) {
  return sharp(imageBuffer)
    .greyscale()
    .normalize()
    .threshold(160)
    .resize({ width: 300 })
    .png()
    .toBuffer();
}

// ── Post-OCR Cleanup ──
const OBVIOUS_FIXES = {
  O: '0',
  o: '0',
  Q: '0',
  D: '0',
  I: '1',
  l: '1',
  '|': '1',
  '!': '1',
  Z: '2',
  z: '2',
  S: '5',
  s: '5',
  B: '8',
  G: '9',
  ' ': ''
};

function correctCaptchaText(raw) {
  let text = raw.trim().replace(/\s+/g, '');
  if (/^[0-9a-z]{4}$/i.test(text)) return text.toLowerCase();

  let corrected = '';
  for (const ch of text) {
    corrected += OBVIOUS_FIXES[ch] || ch;
  }
  return corrected.replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
}

function isValidCaptcha(text) {
  if (!text) return false;
  if (text.length !== 4) return false;
  return /^[0-9a-z]+$/.test(text);
}

async function solveCaptchaImage(imageBuffer) {
  const processed = await preprocessCaptcha(imageBuffer);
  const worker = await getOCRWorker();
  const {
    data: { text }
  } = await worker.recognize(processed);
  let result = correctCaptchaText(text.trim().replace(/\s+/g, ''));
  // EE88 captcha = đúng 4 ký tự, cắt nếu OCR trả nhiều hơn
  if (result.length > 4) result = result.substring(0, 4);
  return result;
}

// ── Main Login ──
async function doLogin(baseUrl, username, password, maxRetries = 10) {
  const session = new HttpSession(baseUrl);
  const startTime = Date.now();
  log.info(`[${username}] UA: ${session.userAgent.substring(0, 60)}...`);

  // Step 1: Lấy RSA public key
  log.info(`[${username}] Lấy public key...`);
  const initRes = await session.postJSON('/agent/login', { scene: 'init' });
  const initData = initRes.data;

  const publicKey = initData.public_key || (initData.data || {}).public_key;
  if (initData.code !== 1 || !publicKey) {
    return {
      success: false,
      error: `Không lấy được public key: ${JSON.stringify(initData).substring(0, 100)}`,
      attempts: 0
    };
  }

  const encryptedPassword = rsaEncrypt(password, publicKey);
  log.ok(`[${username}] RSA encrypt OK (${Date.now() - startTime}ms)`);

  // Step 2: Captcha loop
  let skipCount = 0;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const attemptStart = Date.now();
    log.info(`[${username}] Attempt ${attempt}/${maxRetries}`);

    // Lấy captcha image
    const capRes = await session.get('/agent/captcha', {
      responseType: 'arraybuffer',
      timeout: 6000
    });

    const contentType = capRes.headers['content-type'] || '';
    if (!contentType.startsWith('image')) {
      log.warn(
        `[${username}] Captcha response không phải image: ${contentType}`
      );
      return {
        success: false,
        error: 'Captcha không phải image',
        attempts: attempt
      };
    }

    // OCR giải captcha
    const captchaText = await solveCaptchaImage(Buffer.from(capRes.data));
    const ocrMs = Date.now() - attemptStart;
    log.info(`[${username}] Captcha = '${captchaText}' (${ocrMs}ms)`);

    // Validate captcha trước khi submit
    if (!isValidCaptcha(captchaText)) {
      skipCount++;
      log.warn(`[${username}] Captcha không hợp lệ ('${captchaText}'), bỏ qua`);
      if (skipCount >= 5) {
        log.warn(
          `[${username}] 5 lần OCR liên tiếp không hợp lệ, thử submit anyway`
        );
        skipCount = 0;
      } else {
        continue;
      }
    } else {
      skipCount = 0;
    }

    // Submit login
    const loginRes = await session.postJSON('/agent/login', {
      username,
      password: encryptedPassword,
      captcha: captchaText,
      scene: 'login'
    });

    const result = loginRes.data;
    log.info(`[${username}] code=${result.code}, msg=${result.msg}`);

    if (result.code === 1) {
      const allCookies = session.getCookieString();
      const phpsessid = session.cookies['PHPSESSID'] || '';
      const totalMs = Date.now() - startTime;
      log.ok(`[${username}] Login OK! ${attempt} lần thử, ${totalMs}ms`);

      return {
        success: true,
        phpsessid,
        cookies: allCookies,
        user_agent: session.userAgent,
        attempts: attempt
      };
    }

    // Captcha sai → retry
    const msg = (result.msg || '').toLowerCase();
    if (
      msg.includes('xác nhận') ||
      msg.includes('captcha') ||
      msg.includes('验证码') ||
      msg.includes('mã xác') ||
      msg.includes('verification')
    ) {
      continue;
    }

    // Lỗi khác (sai mật khẩu, bị khoá) → dừng ngay
    return {
      success: false,
      error: result.msg || 'Login thất bại',
      attempts: attempt
    };
  }

  return {
    success: false,
    error: `Hết ${maxRetries} lần thử`,
    attempts: maxRetries
  };
}

// ── Cleanup ──
async function terminateOCR() {
  if (_worker) {
    try {
      await _worker.terminate();
    } catch {}
    _worker = null;
    _workerReady = false;
    _initPromise = null;
  }
  keepAliveHttpAgent.destroy();
  keepAliveHttpsAgent.destroy();
}

// ── Check if solver is ready (OCR worker initialized) ──
function isSolverReady() {
  return _workerReady;
}

module.exports = { doLogin, terminateOCR, getOCRWorker, isSolverReady };
