/**
 * Phase 2: CHỈ 1 endpoint — members
 * Mở rộng thêm endpoints ở Phase 4
 */
const ENDPOINTS = {
  members: {
    path: '/agent/user.html',
    description: 'Danh sách hội viên',
    defaultParams: { page: 1, limit: 500 },
    timeout: 15000
  }
};

module.exports = ENDPOINTS;
