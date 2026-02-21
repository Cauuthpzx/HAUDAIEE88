/**
 * WebSocket Server — Socket.IO tích hợp với Express HTTP server
 *
 * Cung cấp:
 *   - Namespace /realtime cho customer events
 *   - JWT authentication cho WebSocket connections
 *   - Kết nối với pollerEmitter để push events realtime
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config/default');
const { pollerEmitter } = require('./realtimePoller');
const { createLogger } = require('../utils/logger');

const log = createLogger('websocket');

let io = null;

/**
 * Khởi tạo Socket.IO server, gắn vào HTTP server
 * @param {http.Server} httpServer — HTTP server từ app.listen()
 */
function initWebSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: function (origin, cb) {
        // Cho phép same-origin + localhost
        if (!origin || origin.startsWith('http://localhost'))
          return cb(null, true);
        cb(null, false);
      },
      credentials: true
    },
    path: '/ws',
    transports: ['websocket', 'polling']
  });

  // ── JWT Auth middleware cho Socket.IO ──
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (!token) {
      return next(new Error('Chưa xác thực'));
    }
    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      socket.user = decoded;
      next();
    } catch (err) {
      return next(new Error('Token không hợp lệ'));
    }
  });

  // ── Connection handler ──
  io.on('connection', (socket) => {
    const user = socket.user;
    log.info(`WS connected: ${user.username} (${user.role})`);

    // Join room theo role
    if (user.role === 'admin') {
      socket.join('admins');
    }
    socket.join('users');

    // Client có thể subscribe theo agent
    socket.on('subscribe_agent', (agentId) => {
      socket.join(`agent:${agentId}`);
      log.info(`${user.username} subscribed agent #${agentId}`);
    });

    socket.on('unsubscribe_agent', (agentId) => {
      socket.leave(`agent:${agentId}`);
    });

    socket.on('disconnect', () => {
      log.info(`WS disconnected: ${user.username}`);
    });
  });

  // ── Lắng nghe events từ poller → push qua WebSocket ──
  pollerEmitter.on('customer_events', (events) => {
    if (!io) return;

    for (const event of events) {
      // Push tới room chung
      io.to('users').emit('customer_event', event);

      // Push tới room agent cụ thể
      if (event.agentId) {
        io.to(`agent:${event.agentId}`).emit('customer_event', event);
      }
    }

    // Gửi badge count cho admins
    const newCount = events.filter((e) => e.type === 'new').length;
    const lostCount = events.filter((e) => e.type === 'lost').length;
    if (newCount > 0 || lostCount > 0) {
      io.to('admins').emit('event_summary', {
        newCount,
        lostCount,
        timestamp: new Date().toISOString()
      });
    }
  });

  log.ok('WebSocket server đã khởi tạo (path: /ws)');
  return io;
}

/**
 * Lấy Socket.IO instance
 */
function getIO() {
  return io;
}

/**
 * Đếm số connections hiện tại
 */
function getConnectionCount() {
  if (!io) return 0;
  return io.engine.clientsCount;
}

module.exports = { initWebSocket, getIO, getConnectionCount };
