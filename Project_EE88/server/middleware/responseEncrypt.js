/**
 * Response Obfuscation Middleware
 * Wraps res.json() to base64-encode response body khi client gửi X-Enc: 1
 *
 * - Client gửi X-Enc: 1 header → response body được base64 encode → { _enc: "base64_string" }
 * - Không có header → passthrough bình thường
 */

function responseEncryptMiddleware(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function (body) {
    if (req.headers['x-enc'] !== '1') {
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
