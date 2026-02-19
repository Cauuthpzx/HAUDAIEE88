/**
 * Crypto Utils — Mã hóa AES-256-CBC cho dữ liệu nhạy cảm (ee88_password)
 *
 * Format: iv_hex:encrypted_hex
 * Key: 32 bytes (64 hex chars) từ ENCRYPTION_KEY env
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('./logger');

const log = createLogger('crypto');
const IV_LENGTH = 16;

let _encryptionKey = null;

/**
 * Lấy encryption key (lazy load + cache)
 */
function getKey() {
  if (_encryptionKey) return _encryptionKey;

  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY chưa được cấu hình hoặc không hợp lệ (cần 64 hex chars)'
    );
  }

  _encryptionKey = Buffer.from(keyHex, 'hex');
  return _encryptionKey;
}

/**
 * Đảm bảo ENCRYPTION_KEY tồn tại trong .env
 * Nếu chưa có → sinh random 32 bytes, append vào .env
 */
function ensureEncryptionKey() {
  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length === 64) {
    return; // Đã có key hợp lệ
  }

  // Sinh key mới
  const newKey = crypto.randomBytes(32).toString('hex');
  process.env.ENCRYPTION_KEY = newKey;
  _encryptionKey = null; // Reset cache

  // Ghi vào .env file
  const envPath = path.join(process.cwd(), '.env');
  try {
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    if (envContent.includes('ENCRYPTION_KEY=')) {
      // Replace dòng cũ
      envContent = envContent.replace(
        /ENCRYPTION_KEY=.*/,
        `ENCRYPTION_KEY=${newKey}`
      );
    } else {
      // Append dòng mới
      envContent = envContent.trimEnd() + `\nENCRYPTION_KEY=${newKey}\n`;
    }

    fs.writeFileSync(envPath, envContent);
    log.warn('ENCRYPTION_KEY chưa có — đã tự sinh và ghi vào .env');
    log.warn(
      'Hãy backup giá trị ENCRYPTION_KEY này! Mất key = mất dữ liệu mã hóa.'
    );
  } catch (err) {
    log.error(`Không thể ghi ENCRYPTION_KEY vào .env: ${err.message}`);
    log.warn(`ENCRYPTION_KEY tạm: ${newKey} — hãy thêm thủ công vào .env`);
  }
}

/**
 * Mã hóa text → iv_hex:encrypted_hex
 */
function encrypt(text) {
  if (!text) return text;

  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Giải mã iv_hex:encrypted_hex → plaintext
 */
function decrypt(text) {
  if (!text || !isEncrypted(text)) return text;

  const key = getKey();
  const [ivHex, encryptedHex] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Kiểm tra text có phải đã mã hóa không (format iv_hex:encrypted_hex)
 * IV = 32 hex chars, encrypted = ít nhất 32 hex chars
 */
function isEncrypted(text) {
  if (!text || typeof text !== 'string') return false;
  const parts = text.split(':');
  if (parts.length !== 2) return false;
  // IV phải đúng 32 hex chars (16 bytes)
  if (parts[0].length !== 32) return false;
  // Cả 2 phần phải là hex
  return (
    /^[0-9a-f]+$/.test(parts[0]) &&
    /^[0-9a-f]+$/.test(parts[1]) &&
    parts[1].length >= 32
  );
}

/**
 * Mã hóa response JSON → iv_hex:base64_ciphertext
 * Dùng cho API response encryption (per-session key từ JWT ek)
 * @param {string} jsonStr — JSON string to encrypt
 * @param {string} keyHex — 64 hex char key (from JWT ek claim)
 * @returns {string} iv_hex:base64_ciphertext
 */
function encryptResponse(jsonStr, keyHex) {
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

  let encrypted = cipher.update(jsonStr, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  return iv.toString('hex') + ':' + encrypted.toString('base64');
}

module.exports = {
  encrypt,
  decrypt,
  isEncrypted,
  ensureEncryptionKey,
  encryptResponse
};
