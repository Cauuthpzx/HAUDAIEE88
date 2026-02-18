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
  cache: {
    enabled: process.env.CACHE_ENABLED !== 'false',
    cronSchedule: process.env.CACHE_CRON || '5 0 * * *',
    staleTTL: parseInt(process.env.CACHE_STALE_TTL) || 5 * 60 * 1000 // 5 phút
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
