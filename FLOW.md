GIAI ĐOẠN 1: Hiểu nguồn dữ liệu (API Spec)
Mục tiêu: Reverse-engineer API ee88, ghi chép endpoint, request/response format.


Project_EE88/
├── docs/
│   ├── api-spec.md          ← Ghi chép tất cả endpoint ee88
│   ├── endpoints.md          ← URL, method, params, response format
│   └── sample-responses/     ← Lưu JSON response mẫu
│       ├── members.json
│       ├── deposits.json
│       ├── withdrawals.json
│       ├── bet-orders.json
│       ├── invites.json
│       ├── report-lottery.json
│       ├── report-funds.json
│       └── report-third.json
├── scripts/
│   └── test-api.js           ← Script curl/axios thử gọi API ee88
├── package.json              ← Chỉ có axios để test
└── .gitignore
Kết quả kiểm tra được:

Chạy node scripts/test-api.js → nhận được JSON thật từ ee88
File docs/api-spec.md có đầy đủ 8 endpoint, params, response schema
GIAI ĐOẠN 2: Backend core — 1 agent, 1 endpoint
Mục tiêu: Express server hoạt động, proxy được 1 endpoint (members) từ 1 tài khoản ee88.


Project_EE88/
├── server/
│   ├── server.js                 ← Express app, listen port 3001
│   ├── .env                      ← PORT, EE88_BASE_URL
│   ├── config/
│   │   └── endpoints.js          ← CHỈ 1 endpoint: members
│   ├── services/
│   │   └── ee88Client.js         ← Axios gọi ee88, nhận cookie PHPSESSID
│   ├── routes/
│   │   └── proxy.js              ← GET /api/data/members → gọi ee88 → trả JSON
│   └── package.json              ← express, axios, dotenv, cors, morgan
├── docs/                         ← Giữ nguyên từ Phase 1
└── .gitignore
Kết quả kiểm tra được:


node server/server.js
curl http://localhost:3001/api/data/members
# → { code: 0, data: [...members from 1 ee88 account...] }
Nguyên tắc: Chưa cần auth, chưa cần cache, chưa cần multi-agent. Chỉ cần 1 đường ống hoạt động end-to-end.

GIAI ĐOẠN 3: Frontend tĩnh — Hiển thị data thật
Mục tiêu: 1 trang HTML hiển thị bảng members với data thật từ backend.


Project_EE88/
├── server/                       ← Giữ nguyên từ Phase 2
│   ├── server.js                 ← Thêm: serve static từ client/
│   ├── .env
│   ├── config/
│   │   └── endpoints.js
│   ├── services/
│   │   └── ee88Client.js
│   ├── routes/
│   │   └── proxy.js
│   └── package.json
├── client/
│   ├── index.html                ← Redirect → pages/admin.html
│   ├── pages/
│   │   ├── admin.html            ← Shell: sidebar + AJAX tab loader
│   │   └── agent/
│   │       └── user.html         ← CHỈ 1 TRANG: bảng members
│   ├── js/
│   │   └── hub-api.js            ← fetch('/api/data/' + endpoint)
│   └── lib/
│       └── layui/                ← Layui framework files
├── docs/
└── .gitignore
Kết quả kiểm tra được:

Mở http://localhost:3001/pages/admin.html
Click menu "Hội viên" → bảng hiển thị data thật từ ee88
Tìm kiếm, phân trang hoạt động (client-side)
Nguyên tắc: Hoàn thiện 1 trang 100% (search, reset, pagination, loading state) trước khi sang Phase 4. Trang này sẽ là template cho các trang khác.

GIAI ĐOẠN 4: Mở rộng ngang — Thêm endpoint + trang
Mục tiêu: Copy pattern từ Phase 3 ra tất cả 8 endpoint + 8 trang. Vẫn chỉ 1 agent.


Project_EE88/
├── server/
│   ├── server.js
│   ├── .env
│   ├── config/
│   │   └── endpoints.js          ← MỞ RỘNG: 8 endpoints đầy đủ
│   ├── services/
│   │   ├── ee88Client.js
│   │   ├── paramMapper.js        ← MỚI: map web params → ee88 params
│   │   └── responseNormalizer.js  ← MỚI: chuẩn hoá response
│   ├── routes/
│   │   └── proxy.js              ← Xử lý /api/data/:endpoint (dynamic)
│   └── package.json
├── client/
│   ├── index.html
│   ├── pages/
│   │   ├── admin.html            ← Sidebar đầy đủ 8 menu items
│   │   └── agent/
│   │       ├── user.html              ← Hội viên
│   │       ├── inviteList.html        ← Mã mời
│   │       ├── depositAndWithdrawal.html  ← Nạp tiền
│   │       ├── withdrawalsRecord.html ← Rút tiền
│   │       ├── betOrder.html          ← Cược xổ số
│   │       ├── reportLottery.html     ← Báo cáo xổ số
│   │       ├── reportThirdGame.html   ← Báo cáo nhà cung cấp
│   │       └── reportFunds.html       ← Sao kê giao dịch
│   ├── js/
│   │   └── hub-api.js
│   └── lib/
│       └── layui/
├── docs/
└── .gitignore
Kết quả kiểm tra được:

Tất cả 8 trang hiển thị data thật
Mỗi trang: search, reset, quick date select, phân trang đều hoạt động
Các trang report có "Dữ liệu tổng hợp" ở dưới bảng
Nguyên tắc: Không thêm tính năng mới. Chỉ nhân bản pattern đã hoạt động. Nếu trang nào cần logic khác (vd: quick date select), thêm vào chỉ trang đó.

GIAI ĐOẠN 5: Multi-agent + Authentication
Mục tiêu: Hỗ trợ N tài khoản ee88, fan-out gộp data, JWT auth, phân quyền.


Project_EE88/
├── server/
│   ├── server.js                     ← Mount thêm auth, admin routes
│   ├── .env                          ← Thêm JWT_SECRET
│   ├── config/
│   │   ├── endpoints.js
│   │   └── default.js                ← MỚI: centralized config
│   ├── database/
│   │   ├── schema.sql                ← MỚI: hub_users, ee88_agents, permissions
│   │   └── init.js                   ← MỚI: tạo DB + seed admin
│   ├── middleware/
│   │   ├── auth.js                   ← MỚI: JWT verify → req.user
│   │   ├── permission.js             ← MỚI: req.agentIds từ permissions
│   │   └── errorHandler.js           ← MỚI: global error handler
│   ├── services/
│   │   ├── ee88Client.js
│   │   ├── paramMapper.js
│   │   ├── responseNormalizer.js
│   │   ├── fanout.js                 ← MỚI: gọi N agents song song, gộp data
│   │   └── loginService.js           ← MỚI: auto-login ee88 (captcha solver)
│   ├── routes/
│   │   ├── proxy.js                  ← SỬA: dùng fanout thay vì gọi trực tiếp
│   │   ├── auth.js                   ← MỚI: login, logout, me
│   │   └── admin.js                  ← MỚI: CRUD agents, users, permissions
│   ├── workers/
│   │   └── loginWorker.js            ← MỚI: Worker Thread cho login
│   └── package.json                  ← Thêm: better-sqlite3, jsonwebtoken, bcryptjs, p-limit
├── client/
│   ├── index.html
│   ├── pages/
│   │   ├── login.html                ← MỚI: trang đăng nhập Hub
│   │   ├── admin.html                ← SỬA: auth guard, thêm menu Quản lí
│   │   ├── agent/                    ← 8 trang giữ nguyên
│   │   │   ├── user.html
│   │   │   ├── inviteList.html
│   │   │   ├── depositAndWithdrawal.html
│   │   │   ├── withdrawalsRecord.html
│   │   │   ├── betOrder.html
│   │   │   ├── reportLottery.html
│   │   │   ├── reportThirdGame.html
│   │   │   └── reportFunds.html
│   │   └── manage/                   ← MỚI: quản lí
│   │       ├── manageAgents.html     ← CRUD tài khoản ee88
│   │       └── manageUsers.html      ← CRUD users + phân quyền
│   ├── js/
│   │   └── hub-api.js                ← SỬA: thêm JWT token vào header
│   └── lib/
│       └── layui/
├── captcha/
│   └── solver.py                     ← MỚI: Python captcha solver
├── docs/
└── .gitignore
Kết quả kiểm tra được:

http://localhost:3001 → redirect login.html → nhập admin/admin123 → JWT
Trang manageAgents: thêm 10+ tài khoản ee88, login tự động
Trang user.html: hiển thị data gộp từ N agents, cột "Đại lý" phân biệt
Phân quyền: user A chỉ thấy agent 1,2,3 — user B thấy agent 4,5
GIAI ĐOẠN 6: Cache + Sync + Polish
Mục tiêu: Cache data cũ vào SQLite, cron sync, tối ưu hiệu suất.


Project_EE88/
├── server/
│   ├── server.js
│   ├── .env
│   ├── config/
│   │   ├── endpoints.js
│   │   └── default.js
│   ├── database/
│   │   ├── schema.sql                ← MỞ RỘNG: thêm bảng cache + data tables
│   │   ├── init.js
│   │   └── agent-hub.db              ← Auto-generated SQLite file
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── permission.js
│   │   └── errorHandler.js
│   ├── services/
│   │   ├── ee88Client.js
│   │   ├── paramMapper.js
│   │   ├── responseNormalizer.js
│   │   ├── fanout.js                 ← SỬA: check cache trước khi gọi API
│   │   ├── loginService.js
│   │   ├── cacheManager.js           ← MỚI: read/write cache, lock ngày cũ
│   │   └── cronSync.js               ← MỚI: cron 00:05 khoá ngày hôm qua
│   ├── routes/
│   │   ├── proxy.js
│   │   ├── auth.js
│   │   ├── admin.js
│   │   └── sync.js                   ← MỚI: manual sync, sync status
│   ├── workers/
│   │   └── loginWorker.js
│   └── package.json                  ← Thêm: node-cron
├── client/
│   ├── index.html
│   ├── pages/
│   │   ├── login.html
│   │   ├── admin.html
│   │   ├── agent/                    ← 8 trang giữ nguyên
│   │   └── manage/
│   │       ├── manageAgents.html
│   │       ├── manageUsers.html
│   │       └── syncStatus.html       ← MỚI: xem trạng thái cache/sync
│   ├── js/
│   │   ├── hub-api.js
│   │   └── hub-cache.js              ← MỚI: client-side session cache
│   └── lib/
│       └── layui/
├── captcha/
│   └── solver.py
├── docs/
├── gulpfile.js                       ← SỬA: proxy /api → 3001
├── package.json
└── .gitignore
Kết quả kiểm tra được:

Ngày hôm qua trở về trước → query từ SQLite (nhanh, không gọi ee88)
Ngày hôm nay → gọi API ee88 real-time
Cron tự động khoá + sync mỗi đêm
Trang syncStatus: xem bao nhiêu ngày đã cache, agent nào lỗi
GIAI ĐOẠN 7 (Bonus): Real-time + Dashboard
Mục tiêu: Biểu đồ, tổng kết real-time, SSE push.


Project_EE88/
├── server/
│   ├── ... (giữ nguyên Phase 6)
│   ├── routes/
│   │   ├── ... (giữ nguyên)
│   │   └── sse.js                    ← MỚI: SSE endpoint /api/sse/dashboard
│   └── services/
│       ├── ... (giữ nguyên)
│       └── dashboardAggregator.js    ← MỚI: tổng hợp data cho dashboard
├── client/
│   ├── pages/
│   │   ├── agent/
│   │   │   ├── ... (giữ nguyên 8 trang)
│   │   │   └── dashboard.html        ← MỚI: biểu đồ + tổng kết real-time
│   │   └── manage/
│   │       └── ... (giữ nguyên)
│   ├── js/
│   │   ├── hub-api.js
│   │   ├── hub-cache.js
│   │   └── hub-sse.js                ← MỚI: EventSource wrapper
│   └── lib/
│       ├── layui/
│       └── echarts/
│           └── echarts.min.js        ← MỚI: thư viện biểu đồ
├── ... (giữ nguyên)
Tóm tắt nguyên tắc xuyên suốt
Giai đoạn	Thêm bao nhiêu file	Focus
1	5-10 file docs	Hiểu rõ data, không code vội
2	~5 files	1 endpoint, 1 agent, end-to-end
3	~5 files	1 trang frontend hoàn chỉnh 100%
4	+7 pages, +2 services	Copy pattern, không thêm tính năng
5	+8 files (auth, db, admin)	Multi-agent, login, phân quyền
6	+4 files (cache, cron, sync)	Tối ưu, không gọi API thừa
7	+4 files (SSE, charts)	Real-time, chỉ làm khi Phase 6 ổn
Quy tắc vàng: Mỗi giai đoạn phải chạy được và test được trước khi sang giai đoạn tiếp. Không bao giờ code 2 giai đoạn cùng lúc.