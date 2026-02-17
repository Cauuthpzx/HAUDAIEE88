module.exports = {
  port: parseInt(process.env.PORT) || 3001,
  jwt: {
    secret: process.env.JWT_SECRET || 'agent-hub-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },
  fanout: {
    concurrency: parseInt(process.env.FANOUT_CONCURRENCY) || 5,
    timeout: parseInt(process.env.FANOUT_TIMEOUT) || 15000
  }
};
