/**
 * Hub Crypto — AES-256-CBC response decryption (Web Crypto API)
 *
 * Server encrypt mỗi response authenticated → { _enc: "iv_hex:base64_ciphertext" }
 * Client giải mã bằng session key (ek) lấy từ JWT payload.
 *
 * Usage:
 *   const data = await HubCrypto.decrypt(obj._enc);
 */

 
var HubCrypto = (function () {
  'use strict';

  var _cryptoKey = null; // CryptoKey cache (import once, reuse)
  var _keyHex = null; // Raw hex key cache

  /**
   * Extract ek (encryption key) from JWT token stored in localStorage
   * JWT format: header.payload.signature — payload is base64url encoded JSON
   */
  function _getKeyHex() {
    if (_keyHex) return _keyHex;

    var token = localStorage.getItem('hub_token');
    if (!token) return null;

    try {
      var parts = token.split('.');
      if (parts.length !== 3) return null;

      // base64url → base64 → decode
      var payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      var decoded = JSON.parse(atob(payload));

      if (decoded.ek && decoded.ek.length === 64) {
        _keyHex = decoded.ek;
        return _keyHex;
      }
    } catch (e) {
      // Invalid token format
    }
    return null;
  }

  /**
   * Get/import CryptoKey (cached)
   */
  function _getCryptoKey() {
    var keyHex = _getKeyHex();
    if (!keyHex) return Promise.reject(new Error('No encryption key'));

    if (_cryptoKey) return Promise.resolve(_cryptoKey);

    // hex → ArrayBuffer
    var keyBytes = new Uint8Array(32);
    for (var i = 0; i < 64; i += 2) {
      keyBytes[i / 2] = parseInt(keyHex.substr(i, 2), 16);
    }

    return crypto.subtle
      .importKey('raw', keyBytes.buffer, { name: 'AES-CBC' }, false, [
        'decrypt'
      ])
      .then(function (key) {
        _cryptoKey = key;
        return key;
      });
  }

  /**
   * Check if response object is encrypted
   * @param {Object} obj — parsed JSON response
   * @returns {boolean}
   */
  function isEncrypted(obj) {
    return obj && typeof obj._enc === 'string' && obj._enc.indexOf(':') > 0;
  }

  /**
   * Decrypt encrypted response string → original JSON object
   * @param {string} encStr — "iv_hex:base64_ciphertext"
   * @returns {Promise<Object>}
   */
  function decrypt(encStr) {
    var colonIdx = encStr.indexOf(':');
    var ivHex = encStr.substring(0, colonIdx);
    var b64 = encStr.substring(colonIdx + 1);

    // IV: hex → Uint8Array
    var iv = new Uint8Array(16);
    for (var i = 0; i < 32; i += 2) {
      iv[i / 2] = parseInt(ivHex.substr(i, 2), 16);
    }

    // Ciphertext: base64 → ArrayBuffer
    var binary = atob(b64);
    var ciphertext = new Uint8Array(binary.length);
    for (var j = 0; j < binary.length; j++) {
      ciphertext[j] = binary.charCodeAt(j);
    }

    return _getCryptoKey().then(function (key) {
      return crypto.subtle
        .decrypt({ name: 'AES-CBC', iv: iv }, key, ciphertext.buffer)
        .then(function (plainBuf) {
          var plainText = new TextDecoder().decode(plainBuf);
          return JSON.parse(plainText);
        });
    });
  }

  /**
   * Decrypt if encrypted, passthrough if not
   * @param {Object} obj — parsed JSON response
   * @returns {Promise<Object>}
   */
  function decryptIfNeeded(obj) {
    if (!isEncrypted(obj)) return Promise.resolve(obj);
    return decrypt(obj._enc);
  }

  /**
   * Clear cached key (call on logout)
   */
  function clearKey() {
    _cryptoKey = null;
    _keyHex = null;
  }

  // ═══════════════════════════════════════════
  // Pure JS AES-256-CBC sync decrypt
  // Dùng cho jQuery dataFilter (sync context)
  // ═══════════════════════════════════════════

  /* AES S-box */
  var SBOX = [
    99, 124, 119, 123, 242, 107, 111, 197, 48, 1, 103, 43, 254, 215, 171, 118,
    202, 130, 201, 125, 250, 89, 71, 240, 173, 212, 162, 175, 156, 164, 114,
    192, 183, 253, 147, 38, 54, 63, 247, 204, 52, 165, 229, 241, 113, 216, 49,
    21, 4, 199, 35, 195, 24, 150, 5, 154, 7, 18, 128, 226, 235, 39, 178, 117, 9,
    131, 44, 26, 27, 110, 90, 160, 82, 59, 214, 179, 41, 227, 47, 132, 83, 209,
    0, 237, 32, 252, 177, 91, 106, 203, 190, 57, 74, 76, 88, 207, 208, 239, 170,
    251, 67, 77, 51, 133, 69, 249, 2, 127, 80, 60, 159, 168, 81, 163, 64, 143,
    146, 157, 56, 245, 188, 182, 218, 33, 16, 255, 243, 210, 205, 12, 19, 236,
    95, 151, 68, 23, 196, 167, 126, 61, 100, 93, 25, 115, 96, 129, 79, 220, 34,
    42, 144, 136, 70, 238, 184, 20, 222, 94, 11, 219, 224, 50, 58, 10, 73, 6,
    36, 92, 194, 211, 172, 98, 145, 149, 228, 121, 231, 200, 55, 109, 141, 213,
    78, 169, 108, 86, 244, 234, 101, 122, 174, 8, 186, 120, 37, 46, 28, 166,
    180, 198, 232, 221, 116, 31, 75, 189, 139, 138, 112, 62, 181, 102, 72, 3,
    246, 14, 97, 53, 87, 185, 134, 193, 29, 158, 225, 248, 152, 17, 105, 217,
    142, 148, 155, 30, 135, 233, 206, 85, 40, 223, 140, 161, 137, 13, 191, 230,
    66, 104, 65, 153, 45, 15, 176, 84, 187, 22
  ];
  /* AES inverse S-box */
  var SBOX_INV = [
    82, 9, 106, 213, 48, 54, 165, 56, 191, 64, 163, 158, 129, 243, 215, 251,
    124, 227, 57, 130, 155, 47, 255, 135, 52, 142, 67, 68, 196, 222, 233, 203,
    84, 123, 148, 50, 166, 194, 35, 61, 238, 76, 149, 11, 66, 250, 195, 78, 8,
    46, 161, 102, 40, 217, 36, 178, 118, 91, 162, 73, 109, 139, 209, 37, 114,
    248, 246, 100, 134, 104, 152, 22, 212, 164, 92, 204, 93, 101, 182, 146, 108,
    112, 72, 80, 253, 237, 185, 218, 94, 21, 70, 87, 167, 141, 157, 132, 144,
    216, 171, 0, 140, 188, 211, 10, 247, 228, 88, 5, 184, 179, 69, 6, 208, 44,
    30, 143, 202, 63, 15, 2, 193, 175, 189, 3, 1, 19, 138, 107, 58, 145, 17, 65,
    79, 103, 220, 234, 151, 242, 207, 206, 240, 180, 230, 115, 150, 172, 116,
    34, 231, 173, 53, 133, 226, 249, 55, 232, 28, 117, 223, 110, 71, 241, 26,
    113, 29, 41, 197, 137, 111, 183, 98, 14, 170, 24, 190, 27, 252, 86, 62, 75,
    198, 210, 121, 32, 154, 219, 192, 254, 120, 205, 90, 244, 31, 221, 168, 51,
    136, 7, 199, 49, 177, 18, 16, 89, 39, 128, 236, 95, 96, 81, 127, 169, 25,
    181, 74, 13, 45, 229, 122, 159, 147, 201, 156, 239, 160, 224, 59, 77, 174,
    42, 245, 176, 200, 235, 187, 60, 131, 83, 153, 97, 23, 43, 4, 126, 186, 119,
    214, 38, 225, 105, 20, 99, 85, 33, 12, 125
  ];
  /* Rcon */
  var RCON = [1, 2, 4, 8, 16, 32, 64, 128, 27, 54];

  function _xtime(a) {
    return ((a << 1) ^ (((a >> 7) & 1) * 0x1b)) & 0xff;
  }

  function _keyExpansion(keyBytes) {
    var Nk = 8,
      Nr = 14,
      Nb = 4;
    var W = new Uint8Array(4 * Nb * (Nr + 1));
    var i;
    for (i = 0; i < 4 * Nk; i++) W[i] = keyBytes[i];
    for (i = Nk; i < Nb * (Nr + 1); i++) {
      var t = W.slice((i - 1) * 4, i * 4);
      if (i % Nk === 0) {
        var tmp = t[0];
        t[0] = SBOX[t[1]];
        t[1] = SBOX[t[2]];
        t[2] = SBOX[t[3]];
        t[3] = SBOX[tmp];
        t[0] ^= RCON[((i / Nk) | 0) - 1];
      } else if (i % Nk === 4) {
        t[0] = SBOX[t[0]];
        t[1] = SBOX[t[1]];
        t[2] = SBOX[t[2]];
        t[3] = SBOX[t[3]];
      }
      for (var j = 0; j < 4; j++) W[i * 4 + j] = W[(i - Nk) * 4 + j] ^ t[j];
    }
    return W;
  }

  function _invCipher(block, W) {
    var Nr = 14,
      s = new Uint8Array(block);
    var i, j, t;
    // AddRoundKey (last round key)
    for (i = 0; i < 16; i++) s[i] ^= W[Nr * 16 + i];
    for (var rnd = Nr - 1; rnd >= 1; rnd--) {
      // InvShiftRows
      t = s[13];
      s[13] = s[9];
      s[9] = s[5];
      s[5] = s[1];
      s[1] = t;
      t = s[2];
      s[2] = s[10];
      s[10] = t;
      t = s[6];
      s[6] = s[14];
      s[14] = t;
      t = s[3];
      s[3] = s[7];
      s[7] = s[11];
      s[11] = s[15];
      s[15] = t;
      // InvSubBytes
      for (i = 0; i < 16; i++) s[i] = SBOX_INV[s[i]];
      // AddRoundKey
      for (i = 0; i < 16; i++) s[i] ^= W[rnd * 16 + i];
      // InvMixColumns
      for (j = 0; j < 4; j++) {
        var c = j * 4;
        var a0 = s[c],
          a1 = s[c + 1],
          a2 = s[c + 2],
          a3 = s[c + 3];
        s[c] = _mul(a0, 14) ^ _mul(a1, 11) ^ _mul(a2, 13) ^ _mul(a3, 9);
        s[c + 1] = _mul(a0, 9) ^ _mul(a1, 14) ^ _mul(a2, 11) ^ _mul(a3, 13);
        s[c + 2] = _mul(a0, 13) ^ _mul(a1, 9) ^ _mul(a2, 14) ^ _mul(a3, 11);
        s[c + 3] = _mul(a0, 11) ^ _mul(a1, 13) ^ _mul(a2, 9) ^ _mul(a3, 14);
      }
    }
    // Last round (no MixColumns)
    t = s[13];
    s[13] = s[9];
    s[9] = s[5];
    s[5] = s[1];
    s[1] = t;
    t = s[2];
    s[2] = s[10];
    s[10] = t;
    t = s[6];
    s[6] = s[14];
    s[14] = t;
    t = s[3];
    s[3] = s[7];
    s[7] = s[11];
    s[11] = s[15];
    s[15] = t;
    for (i = 0; i < 16; i++) s[i] = SBOX_INV[s[i]];
    for (i = 0; i < 16; i++) s[i] ^= W[i];
    return s;
  }

  function _mul(a, b) {
    var r = 0;
    for (var i = 0; i < 8; i++) {
      if (b & 1) r ^= a;
      var hi = a & 0x80;
      a = (a << 1) & 0xff;
      if (hi) a ^= 0x1b;
      b >>= 1;
    }
    return r;
  }

  /**
   * Synchronous AES-256-CBC decrypt (pure JS)
   * Dùng cho jQuery dataFilter — không cần async
   * @param {string} encStr — "iv_hex:base64_ciphertext"
   * @returns {Object|null} — parsed JSON or null on error
   */
  function decryptSync(encStr) {
    var keyHex = _getKeyHex();
    if (!keyHex) return null;

    try {
      var colonIdx = encStr.indexOf(':');
      var ivHex = encStr.substring(0, colonIdx);
      var b64 = encStr.substring(colonIdx + 1);

      // Key: hex → bytes
      var keyBytes = new Uint8Array(32);
      for (var i = 0; i < 64; i += 2)
        keyBytes[i / 2] = parseInt(keyHex.substr(i, 2), 16);

      // IV: hex → bytes
      var iv = new Uint8Array(16);
      for (var j = 0; j < 32; j += 2)
        iv[j / 2] = parseInt(ivHex.substr(j, 2), 16);

      // Ciphertext: base64 → bytes
      var bin = atob(b64);
      var ct = new Uint8Array(bin.length);
      for (var k = 0; k < bin.length; k++) ct[k] = bin.charCodeAt(k);

      // Key expansion
      var W = _keyExpansion(keyBytes);

      // CBC decrypt
      var plain = new Uint8Array(ct.length);
      var prev = iv;
      for (var blk = 0; blk < ct.length; blk += 16) {
        var block = ct.slice(blk, blk + 16);
        var dec = _invCipher(block, W);
        for (var m = 0; m < 16; m++) plain[blk + m] = dec[m] ^ prev[m];
        prev = block;
      }

      // PKCS7 unpad
      var padLen = plain[plain.length - 1];
      var result = plain.slice(0, plain.length - padLen);

      // bytes → string
      var str = new TextDecoder().decode(result);
      return JSON.parse(str);
    } catch (e) {
      return null;
    }
  }

  return {
    isEncrypted: isEncrypted,
    decrypt: decrypt,
    decryptIfNeeded: decryptIfNeeded,
    decryptSync: decryptSync,
    clearKey: clearKey
  };
})();
