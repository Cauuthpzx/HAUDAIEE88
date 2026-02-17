const { createLogger } = require('../utils/logger');

const log = createLogger('error');

function errorHandler(err, req, res, _next) {
  log.error(`${err.message}`, {
    method: req.method,
    url: req.originalUrl,
    stack: err.stack
  });

  res.status(err.status || 500).json({
    code: -1,
    msg: err.expose ? err.message : 'Lỗi máy chủ nội bộ'
  });
}

module.exports = errorHandler;
