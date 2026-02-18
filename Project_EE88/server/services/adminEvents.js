/**
 * Admin Events — SSE broadcast cho real-time updates
 * Khi agent thay đổi (add/edit/delete/login), emit event tới tất cả connected clients
 */
const { EventEmitter } = require('events');

const adminEmitter = new EventEmitter();
adminEmitter.setMaxListeners(50);

module.exports = adminEmitter;
