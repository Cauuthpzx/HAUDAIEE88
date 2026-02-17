const pLimit = require('p-limit');
const { fetchEndpointForAgent } = require('./ee88Client');
const config = require('../config/default');
const { createLogger } = require('../utils/logger');

const log = createLogger('fanout');
const limit = pLimit(config.fanout.concurrency);

/**
 * Fan-out: gọi N agents song song, gộp kết quả
 * @param {Array} agents — [{id, label, base_url, cookie}, ...]
 * @param {string} endpointKey — tên endpoint (vd: 'members')
 * @param {object} params — query params
 * @returns {object} — { code, msg, count, data[], total_data }
 */
async function fanoutFetch(agents, endpointKey, params) {
  if (agents.length === 0) {
    return { code: 0, msg: '', count: 0, data: [], total_data: null };
  }

  // Nếu chỉ 1 agent, gọi trực tiếp không cần gộp
  if (agents.length === 1) {
    const agent = agents[0];
    const result = await fetchEndpointForAgent(agent, endpointKey, params);
    // Thêm _agent_label vào mỗi row
    if (Array.isArray(result.data)) {
      result.data.forEach(row => {
        row._agent_id = agent.id;
        row._agent_label = agent.label;
      });
    }
    return result;
  }

  // Fan-out N agents song song
  const startTime = Date.now();
  log.info(`Fan-out [${endpointKey}] → ${agents.length} agents`, {
    agents: agents.map(a => a.label)
  });

  const results = await Promise.allSettled(
    agents.map(agent =>
      limit(() => fetchEndpointForAgent(agent, endpointKey, params)
        .then(data => ({ agent, data }))
      )
    )
  );

  // Gộp kết quả
  let mergedData = [];
  let totalCount = 0;
  let mergedTotalData = null;
  let successCount = 0;
  let errors = [];

  for (const r of results) {
    if (r.status === 'fulfilled') {
      const { agent, data } = r.value;
      successCount++;

      if (Array.isArray(data.data)) {
        // Thêm agent info vào mỗi row
        data.data.forEach(row => {
          row._agent_id = agent.id;
          row._agent_label = agent.label;
        });
        mergedData = mergedData.concat(data.data);
      }

      totalCount += (data.count || 0);

      // Gộp total_data (cộng dồn các trường số)
      if (data.total_data) {
        if (!mergedTotalData) {
          mergedTotalData = { ...data.total_data };
        } else {
          for (const key in data.total_data) {
            const val = parseFloat(data.total_data[key]);
            if (!isNaN(val)) {
              mergedTotalData[key] = (parseFloat(mergedTotalData[key]) || 0) + val;
            }
          }
        }
      }
    } else {
      errors.push(r.reason?.message || 'Unknown error');
    }
  }

  const duration = Date.now() - startTime;
  log.ok(`Fan-out [${endpointKey}] hoàn tất — ${duration}ms`, {
    thànhCông: successCount,
    thấtBại: errors.length,
    tổngDòng: mergedData.length,
    tổngSố: totalCount
  });

  if (errors.length > 0) {
    log.warn(`Fan-out [${endpointKey}] có ${errors.length} lỗi`, { errors });
  }

  return {
    code: successCount > 0 ? 0 : 1,
    msg: errors.length > 0 ? `${errors.length}/${agents.length} agent lỗi` : '',
    count: totalCount,
    data: mergedData,
    total_data: mergedTotalData
  };
}

/**
 * Fan-out action: gửi action đến 1 agent cụ thể
 * @param {object} agent — {id, label, base_url, cookie}
 * @param {string} actionPath — ee88 path (vd: '/agent/addUser')
 * @param {object} body — request body
 */
async function fanoutAction(agent, actionPath, body) {
  const axios = require('axios');
  const client = axios.create({
    baseURL: agent.base_url,
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Cookie: agent.cookie
    },
    timeout: 15000
  });

  const params = new URLSearchParams(body).toString();
  const response = await client.post(actionPath, params);

  if (response.data && response.data.url === '/agent/login') {
    const err = new Error('Phiên EE88 đã hết hạn');
    err.code = 'SESSION_EXPIRED';
    throw err;
  }

  return response.data;
}

module.exports = { fanoutFetch, fanoutAction };
