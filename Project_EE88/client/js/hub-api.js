/**
 * Hub API — fetch wrapper cho frontend
 * Gọi backend proxy → ee88
 */
const HubAPI = {
  /**
   * Lấy dữ liệu từ backend
   * @param {string} endpoint — tên endpoint (vd: 'members')
   * @param {object} params — query params (page, limit, username…)
   * @returns {Promise<object>} — { code, count, data[], total_data }
   */
  async fetch(endpoint, params = {}) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const url = qs ? `/api/data/${endpoint}?${qs}` : `/api/data/${endpoint}`;

    const res = await fetch(url);

    if (res.status === 401) {
      throw new Error('SESSION_EXPIRED');
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return res.json();
  }
};
