/**
 * Response Obfuscation Middleware
 * Base64-encode response body CHỈ cho endpoint /api/data/members
 *
 * - Client gửi X-Enc: 1 header + path là /api/data/members → { _enc: "base64_string" }
 * - Tất cả endpoint khác → passthrough bình thường
 */

function responseEncryptMiddleware(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function (body) {
    if (
      req.headers['x-enc'] !== '1' ||
      !req.originalUrl.startsWith('/api/data/members')
    ) {
      return originalJson(body);
    }

    try {
      const jsonStr = JSON.stringify(body);
      const encoded = Buffer.from(jsonStr).toString('base64');
      return originalJson({ _enc: encoded });
    } catch (err) {
      return originalJson(body);
    }
  };

  next();
}

module.exports = responseEncryptMiddleware;
