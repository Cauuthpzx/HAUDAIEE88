/**
 * Redis Client — kết nối Redis + helpers cho realtime polling
 *
 * Dùng ioredis, hỗ trợ auto-reconnect.
 * Mặc định kết nối localhost:6379, config qua env vars.
 */

const Redis = require('ioredis');
const { createLogger } = require('../utils/logger');

const log = createLogger('redis');

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB) || 0,
  maxRetriesPerRequest: 1,
  retryStrategy(times) {
    if (times > 3) {
      log.warn('Redis retry quá 3 lần, ngừng — polling dùng memory fallback');
      return null; // stop retrying
    }
    return Math.min(times * 1000, 3000);
  },
  reconnectOnError: false, // không tự reconnect khi lỗi
  lazyConnect: true // không kết nối ngay, đợi gọi .connect()
});

let connected = false;

redis.on('connect', () => {
  connected = true;
  log.ok('Redis đã kết nối');
});

let errorLogged = false;
redis.on('error', (err) => {
  connected = false;
  if (!errorLogged) {
    log.error(`Redis lỗi: ${err.message}`);
    errorLogged = true;
  }
});

redis.on('close', () => {
  if (connected) {
    log.warn('Redis đã ngắt kết nối');
  }
  connected = false;
});

/**
 * Kết nối Redis (gọi 1 lần khi server start)
 */
async function connectRedis() {
  try {
    await redis.connect();
  } catch (err) {
    log.error(`Không thể kết nối Redis: ${err.message}`);
    log.warn('Polling service sẽ hoạt động không có Redis cache');
  }
}

/**
 * Kiểm tra Redis có sẵn không
 */
function isConnected() {
  return connected;
}

/**
 * Lưu snapshot members vào Redis (SET dạng JSON, key per agent)
 * @param {number} agentId
 * @param {Map<number,object>} memberMap — Map<uid, memberObj>
 */
async function saveMemberSnapshot(agentId, memberMap) {
  if (!connected) return;
  const key = `poll:members:${agentId}`;
  const obj = Object.fromEntries(memberMap);
  await redis.set(key, JSON.stringify(obj), 'EX', 3600); // TTL 1h
}

/**
 * Lấy snapshot members từ Redis
 * @param {number} agentId
 * @returns {Map<number,object>|null}
 */
async function getMemberSnapshot(agentId) {
  if (!connected) return null;
  const key = `poll:members:${agentId}`;
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    return new Map(Object.entries(obj).map(([k, v]) => [Number(k), v]));
  } catch {
    return null;
  }
}

/**
 * Đóng kết nối Redis (graceful shutdown)
 */
async function disconnectRedis() {
  try {
    await redis.quit();
    log.info('Redis đã đóng kết nối');
  } catch {
    // ignore
  }
}

module.exports = {
  redis,
  connectRedis,
  disconnectRedis,
  isConnected,
  saveMemberSnapshot,
  getMemberSnapshot
};
