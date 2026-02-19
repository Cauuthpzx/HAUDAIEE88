/**
 * Response Encryption Middleware
 * Wraps res.json() to encrypt response body using per-session AES-256-CBC key (req.user.ek)
 *
 * - Nếu req.user.ek tồn tại → encrypt response body → { _enc: "iv_hex:base64_ciphertext" }
 * - Nếu không có ek (old token, unauthenticated) → passthrough bình thường
 * - Nếu encrypt lỗi → gửi unencrypted + log error
 */

const { encryptResponse } = require('../utils/crypto');
const { createLogger } = require('../utils/logger');

const log = createLogger('encrypt');

function responseEncryptMiddleware(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function (body) {
    // Skip nếu không có encryption key hoặc client không yêu cầu encrypt
    if (!req.user || !req.user.ek || req.headers['x-enc'] !== '1') {
      return originalJson(body);
    }

    try {
      const jsonStr = JSON.stringify(body);
      const encrypted = encryptResponse(jsonStr, req.user.ek);
      return originalJson({ _enc: encrypted });
    } catch (err) {
      log.error(`Encrypt response failed: ${err.message}`);
      // Fallback: gửi unencrypted
      return originalJson(body);
    }
  };

  next();
}

module.exports = responseEncryptMiddleware;
