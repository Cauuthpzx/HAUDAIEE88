/**
 * Hub Crypto — Base64 response obfuscation
 *
 * Server encode response → { _enc: "base64_string" }
 * Client decode bằng atob() → JSON object gốc.
 */

var HubCrypto = (function () {
  'use strict';

  function isEncrypted(obj) {
    return obj && typeof obj._enc === 'string' && obj._enc.length > 0;
  }

  function decrypt(encStr) {
    try {
      return Promise.resolve(JSON.parse(atob(encStr)));
    } catch (e) {
      return Promise.reject(e);
    }
  }

  function decryptIfNeeded(obj) {
    if (!isEncrypted(obj)) return Promise.resolve(obj);
    return decrypt(obj._enc);
  }

  function decryptSync(encStr) {
    try {
      return JSON.parse(atob(encStr));
    } catch (e) {
      return null;
    }
  }

  function clearKey() {
    /* no-op, giữ cho tương thích */
  }

  return {
    isEncrypted: isEncrypted,
    decrypt: decrypt,
    decryptIfNeeded: decryptIfNeeded,
    decryptSync: decryptSync,
    clearKey: clearKey
  };
})();
