const { createLogger } = require('../utils/logger');

const log = createLogger('error');
const isDev = process.env.NODE_ENV !== 'production';

function errorHandler(err, req, res, _next) {
  log.error(`${err.message}`, {
    method: req.method,
    url: req.originalUrl,
    stack: err.stack
  });

  const status = err.status || 500;
  const response = { code: -1, msg: err.expose ? err.message : 'Lỗi máy chủ nội bộ' };

  // Dev: trả thêm stack trace để debug nhanh
  if (isDev && status >= 500) {
    response.stack = err.stack;
  }

  res.status(status).json(response);
}

module.exports = errorHandler;
