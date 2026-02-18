/**
 * Passive event listener patch
 * Tắt Chrome [Violation] warning cho touchstart/touchmove/mousewheel
 */
(function () {
  var PASSIVE_EVENTS = ['touchstart', 'touchmove', 'mousewheel', 'wheel'];
  var orig = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    if (PASSIVE_EVENTS.indexOf(type) !== -1 && typeof opts !== 'object') {
      opts = { capture: !!opts, passive: true };
    }
    return orig.call(this, type, fn, opts);
  };
})();

/**
 * Hub API — fetch wrapper cho frontend
 * Gọi backend proxy → ee88
 * Tự động gắn JWT token vào header
 */
var HubAPI = {
  TOKEN_KEY: 'hub_token',
  USER_KEY: 'hub_user',
  LOGIN_URL: '/pages/login.html',

  /**
   * Lấy token từ localStorage
   */
  getToken: function () {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  /**
   * Lưu token + user info
   */
  setAuth: function (token, user) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  },

  /**
   * Lấy user info
   */
  getUser: function () {
    try {
      return JSON.parse(localStorage.getItem(this.USER_KEY));
    } catch (e) {
      return null;
    }
  },

  /**
   * Xoá auth
   */
  clearAuth: function () {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  },

  /**
   * Kiểm tra đã đăng nhập chưa
   */
  isLoggedIn: function () {
    return !!this.getToken();
  },

  /**
   * Redirect về login nếu chưa đăng nhập
   */
  requireAuth: function () {
    if (!this.isLoggedIn()) {
      window.top.location.href = HubAPI.LOGIN_URL;
      return false;
    }
    return true;
  },

  /**
   * Đăng nhập
   */
  login: function (username, password) {
    var self = this;
    return fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password })
    }).then(function (res) {
      return res.json();
    }).then(function (data) {
      if (data.code === 0 && data.data) {
        self.setAuth(data.data.token, data.data.user);
      }
      return data;
    });
  },

  /**
   * Đăng xuất
   */
  logout: function () {
    this.clearAuth();
    window.top.location.href = this.LOGIN_URL;
  },

  /**
   * Fetch wrapper với JWT token
   */
  _fetch: function (url, options) {
    var self = this;
    options = options || {};
    options.headers = options.headers || {};

    var token = this.getToken();
    if (token) {
      options.headers['Authorization'] = 'Bearer ' + token;
    }

    return fetch(url, options).then(function (res) {
      // Token hết hạn → redirect login
      if (res.status === 401) {
        self.clearAuth();
        window.top.location.href = HubAPI.LOGIN_URL;
        throw new Error('SESSION_EXPIRED');
      }
      return res;
    });
  },

  /**
   * Lấy dữ liệu từ backend (data endpoints)
   * @param {string} endpoint — tên endpoint (vd: 'members')
   * @param {object} params — query params (page, limit, username…)
   * @returns {Promise<object>} — { code, count, data[], total_data }
   */
  fetch: function (endpoint, params) {
    params = params || {};

    // Phase 6: client-side session cache
    if (typeof HubCache !== 'undefined') {
      var cached = HubCache.get(endpoint, params);
      if (cached) return Promise.resolve(cached);
    }

    var qs = Object.entries(params)
      .filter(function (e) { return e[1] !== undefined && e[1] !== ''; })
      .map(function (e) { return encodeURIComponent(e[0]) + '=' + encodeURIComponent(e[1]); })
      .join('&');

    var url = qs ? '/api/data/' + endpoint + '?' + qs : '/api/data/' + endpoint;

    return this._fetch(url).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      // Cache response
      if (typeof HubCache !== 'undefined' && data && data.code === 0) {
        HubCache.set(endpoint, params, data);
      }
      return data;
    });
  },

  /**
   * Gọi action endpoint
   * @param {string} action — tên action (vd: 'addUser')
   * @param {object} body — request body
   * @returns {Promise<object>}
   */
  action: function (action, body) {
    return this._fetch('/api/action/' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  },

  /**
   * Gọi admin endpoint (GET)
   */
  adminGet: function (path) {
    return this._fetch('/api/admin/' + path).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  },

  /**
   * Gọi admin endpoint (POST/PUT/DELETE)
   */
  adminRequest: function (path, method, body) {
    return this._fetch('/api/admin/' + path, {
      method: method || 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  },

  /**
   * Subscribe admin SSE events (real-time agent/user changes)
   * @param {function} callback — nhận { type, action, id }
   * @returns {EventSource|null}
   */
  subscribeAdmin: function (callback) {
    var token = this.getToken();
    if (!token) return null;
    var es = new EventSource('/api/admin/events?token=' + encodeURIComponent(token));
    es.onmessage = function (event) {
      try { callback(JSON.parse(event.data)); } catch (e) {}
    };
    return es;
  },

  /**
   * Single-panel date range picker (1 bảng lịch, chọn khoảng ngày)
   */
  singleRangePicker: function (elem, opts) {
    opts = opts || {};
    var sep = opts.separator || '|';
    var userReady = opts.ready;
    delete opts.separator;

    return layui.laydate.render(Object.assign({
      type: 'date',
      range: sep,
      rangeLinked: true
    }, opts, {
      elem: elem,
      ready: function () {
        var key = layui.$(elem).attr('lay-key');
        var el = document.getElementById('layui-laydate' + key);
        if (el) el.classList.add('laydate-single-panel');
        if (userReady) userReady.apply(this, arguments);
      }
    }));
  }
};

/**
 * Global jQuery AJAX interceptor
 * Tự động gắn JWT token vào tất cả $.ajax calls (bao gồm layui table)
 * Tự động redirect login khi 401
 * Phải dùng layui.use() vì layui.$ chỉ có sau khi modules sẵn sàng
 */
if (typeof layui !== 'undefined') {
  layui.use(function () {
    var $ = layui.$;
    if ($) {
      $.ajaxSetup({
        beforeSend: function (xhr) {
          var token = HubAPI.getToken();
          if (token) {
            xhr.setRequestHeader('Authorization', 'Bearer ' + token);
          }
        },
        statusCode: {
          401: function () {
            HubAPI.clearAuth();
            window.top.location.href = HubAPI.LOGIN_URL;
          }
        }
      });
    }
  });
}
