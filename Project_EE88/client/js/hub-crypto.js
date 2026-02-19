/**
 * Hub Crypto — Base64 response obfuscation
 *
 * Server encode response → { _enc: "base64_string" }
 * Client decode bằng atob → UTF-8 bytes → TextDecoder → JSON object gốc.
 */

var HubCrypto = (function () {
  'use strict';

  /**
   * Decode base64 string → UTF-8 string
   * atob() trả Latin1 bytes — cần TextDecoder để xử lý UTF-8 đúng
   */
  function _b64decode(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function isEncrypted(obj) {
    return obj && typeof obj._enc === 'string' && obj._enc.length > 0;
  }

  function decrypt(encStr) {
    try {
      return Promise.resolve(JSON.parse(_b64decode(encStr)));
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
      return JSON.parse(_b64decode(encStr));
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
