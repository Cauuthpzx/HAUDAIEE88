module.exports = {
  port: parseInt(process.env.PORT) || 3001,
  jwt: {
    secret: process.env.JWT_SECRET || 'agent-hub-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },
  fanout: {
    concurrency: parseInt(process.env.FANOUT_CONCURRENCY) || 5,
    timeout: parseInt(process.env.FANOUT_TIMEOUT) || 15000
  },
  sync: {
    days: parseInt(process.env.SYNC_DAYS) || 65,
    maxRetries: parseInt(process.env.SYNC_MAX_RETRIES) || 3,
    pageSize: parseInt(process.env.SYNC_PAGE_SIZE) || 2000,
    rateLimitDelay: parseInt(process.env.SYNC_RATE_LIMIT_DELAY) || 15000,
    errorDelay: parseInt(process.env.SYNC_ERROR_DELAY) || 3000,
    timeout: parseInt(process.env.SYNC_TIMEOUT) || 45 * 60 * 1000
  },
  security: {
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_MAX) || 200
    },
    authRateLimit: {
      windowMs: 15 * 60 * 1000,
      max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 10
    },
    bodyLimit: process.env.BODY_LIMIT || '1mb'
  },
  logging: {
    retentionDays: parseInt(process.env.LOG_RETENTION_DAYS) || 30
  }
};
