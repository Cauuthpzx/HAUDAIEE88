# FIRE Admin — EE88 Agent Hub

Hệ thống quản lý đại lý EE88 tập trung, hỗ trợ nhiều agent, phân quyền người dùng, và proxy dữ liệu real-time từ nền tảng EE88.

## Mục lục

- [Tổng quan](#tổng-quan)
- [Kiến trúc hệ thống](#kiến-trúc-hệ-thống)
- [Cài đặt](#cài-đặt)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Backend API](#backend-api)
- [Frontend](#frontend)
- [Quá trình phát triển](#quá-trình-phát-triển)
- [Ghi chú kỹ thuật](#ghi-chú-kỹ-thuật)

---

## Tổng quan

FIRE Admin là web portal cho phép:

- **Quản lý tập trung** nhiều tài khoản đại lý EE88
- **Phân quyền** admin/user — admin thấy tất cả agent, user chỉ thấy agent được gán
- **Proxy dữ liệu** từ EE88 với fan-out song song tới N agent
- **10 endpoint dữ liệu**: hội viên, mã mời, nạp/rút tiền, đơn cược, báo cáo
- **8 action**: đổi mật khẩu, thêm user, quản lý mã mời, cài hoàn trả
- **Đa ngôn ngữ**: Tiếng Việt, English, 中文

### Tech Stack

| Thành phần | Công nghệ |
|-----------|-----------|
| Backend | Express.js |
| Database | SQLite (better-sqlite3, WAL mode) |
| Auth | JWT (24h) + bcryptjs |
| Frontend | Layui v2.13.3 |
| HTTP Client | Axios |
| Logging | Morgan + custom logger |

---

## Kiến trúc hệ thống

```
┌─────────────┐     JWT      ┌──────────────┐    Cookie/POST    ┌──────────┐
│   Browser    │ ◄──────────► │  FIRE Admin  │ ◄───────────────► │   EE88   │
│  (Layui UI)  │              │  (Express)   │    fan-out N      │ Platform │
└─────────────┘              └──────┬───────┘                   └──────────┘
                                    │
                              ┌─────┴─────┐
                              │  SQLite    │
                              │ agent-hub  │
                              └───────────┘
```

**Luồng hoạt động:**

1. User đăng nhập → nhận JWT token (24h)
2. Frontend gọi `/api/data/:endpoint` với JWT
3. Backend xác thực token → kiểm tra quyền agent
4. Fan-out request tới N agent EE88 song song (max 5 concurrent)
5. Gộp kết quả → trả về client

---

## Cài đặt

### Yêu cầu

- Node.js >= 16
- npm

### Bước 1: Cài dependencies

```bash
cd Project_EE88/server
npm install
```

### Bước 2: Tạo file .env

```bash
cp .env.example .env
```

Sửa `.env`:

```env
PORT=3001
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=24h

# Agent EE88 mặc định (tự migrate vào DB lần đầu)
EE88_BASE_URL=https://example.com
EE88_COOKIE=PHPSESSID=your_session_id_here
```

### Bước 3: Chạy server

```bash
# Production
node server.js

# Development (auto-reload)
npm run dev
```

### Bước 4: Đăng nhập

Truy cập `http://localhost:3001` — tài khoản mặc định:

| Username | Password | Role |
|----------|----------|------|
| admin | admin123 | admin |

### Build & Deploy

```bash
# Từ thư mục gốc PROJECT 1
node scripts/build.js
```

Build script tự động:
1. Tìm và tắt server đang chạy (port 3001)
2. Dọn dẹp `dist/`
3. Copy server + client vào `dist/`
4. Restart server với console hiển thị

---

## Cấu trúc thư mục

```
Project_EE88/
├── client/                    # Frontend
│   ├── images/                # Flag icons (vn, uk, china)
│   ├── js/
│   │   ├── hub-api.js         # API wrapper + JWT auto-attach
│   │   └── hub-lang.js        # Hệ thống i18n (VI/EN/ZH)
│   ├── lib/layui/             # Layui framework (source đã tuỳ chỉnh)
│   └── pages/
│       ├── login.html         # Trang đăng nhập
│       ├── admin.html         # Layout chính (header + sidebar + tabs)
│       ├── agent/             # 12 trang agent
│       │   ├── user.html              # Hội viên
│       │   ├── inviteList.html        # Mã mời
│       │   ├── depositAndWithdrawal   # Nạp tiền
│       │   ├── withdrawalsRecord      # Rút tiền
│       │   ├── bet.html               # Đơn cược xổ số
│       │   ├── betOrder.html          # Đơn cược bên thứ 3
│       │   ├── reportLottery.html     # BC xổ số
│       │   ├── reportFunds.html       # Sao kê giao dịch
│       │   ├── reportThirdGame.html   # BC nhà cung cấp
│       │   ├── editPassword.html      # Đổi MK đăng nhập
│       │   ├── editFundPassword.html  # Đổi MK giao dịch
│       │   └── getRebateOddsPanel     # Tỉ lệ hoàn trả
│       └── manage/            # Trang quản trị (admin only)
│           ├── manageAgents.html
│           └── manageUsers.html
├── server/                    # Backend
│   ├── server.js              # Entry point
│   ├── config/
│   │   ├── default.js         # Cấu hình mặc định
│   │   └── endpoints.js       # 10 endpoint EE88
│   ├── database/
│   │   ├── init.js            # Khởi tạo DB + auto-seed
│   │   └── schema.sql         # Schema 3 bảng
│   ├── middleware/
│   │   ├── auth.js            # JWT verify + adminOnly
│   │   ├── permission.js      # Kiểm tra quyền agent
│   │   └── errorHandler.js    # Global error handler
│   ├── routes/
│   │   ├── auth.js            # Login, me, change-password
│   │   ├── proxy.js           # GET /api/data/:endpoint
│   │   ├── action.js          # POST /api/action/:action
│   │   └── admin.js           # CRUD agents + users
│   ├── services/
│   │   ├── ee88Client.js      # HTTP client tới EE88
│   │   ├── fanout.js          # Fan-out N agent song song
│   │   ├── paramMapper.js     # Map params cho EE88
│   │   └── responseNormalizer  # Chuẩn hoá response
│   └── utils/
│       └── logger.js          # Logger với level + file output
├── docs/                      # Tài liệu API + sample responses
└── dist/                      # Build output (git ignored)
```

---

## Backend API

### Authentication `/api/auth`

| Method | Path | Mô tả |
|--------|------|-------|
| POST | `/api/auth/login` | Đăng nhập, trả JWT |
| GET | `/api/auth/me` | Thông tin user + danh sách agent |
| POST | `/api/auth/change-password` | Đổi mật khẩu |

### Data Proxy `/api/data/:endpoint`

Yêu cầu JWT. Proxy request tới EE88 qua tất cả agent được phép.

| Endpoint | EE88 Path | Timeout |
|----------|-----------|---------|
| `members` | `/agent/user.html` | 15s |
| `invites` | `/agent/inviteList.html` | 15s |
| `deposits` | `/agent/depositAndWithdrawal.html` | 15s |
| `withdrawals` | `/agent/withdrawalsRecord.html` | 15s |
| `bet-orders` | `/agent/betOrder.html` | 30s |
| `lottery-bets` | `/agent/bet.html` | 30s |
| `report-lottery` | `/agent/reportLottery.html` | 15s |
| `report-funds` | `/agent/reportFunds.html` | 15s |
| `report-third` | `/agent/reportThirdGame.html` | 15s |

### Actions `/api/action/:action`

| Action | Mô tả |
|--------|-------|
| `editPassword` | Đổi MK đăng nhập |
| `editFundPassword` | Đổi MK giao dịch |
| `getLottery` | Lấy danh sách xổ số |
| `getRebateOddsPanel` | Bảng tỉ lệ hoàn trả |
| `addUser` | Thêm user |
| `setRebate` | Cài đặt hoàn trả |
| `addInvite` / `editInvite` | Quản lý mã mời |

### Admin `/api/admin` (chỉ admin)

| Method | Path | Mô tả |
|--------|------|-------|
| GET/POST | `/api/admin/agents` | CRUD agent |
| PUT/DELETE | `/api/admin/agents/:id` | Sửa/xoá agent |
| POST | `/api/admin/agents/:id/check` | Kiểm tra session còn sống |
| GET/POST | `/api/admin/users` | CRUD user |
| PUT/DELETE | `/api/admin/users/:id` | Sửa/xoá user |

---

## Frontend

### Layout chính (`admin.html`)

Dùng `layui-layout-admin` mặc định của Layui, tuỳ chỉnh:

- **Header**: logo FIRE (đỏ), toggle sidebar, refresh, fullscreen, language switcher, tài khoản dropdown
- **Sidebar**: menu nav-tree với 8 nhóm, collapse animation
- **Body**: hệ thống tabs (iframe) với right-click context menu
- **Theme**: Dark (`#20222A`), accent đỏ (`#ff4d4f`)

### Hệ thống i18n

3 ngôn ngữ được hỗ trợ qua `hub-lang.js`:

- Tiếng Việt (mặc định)
- English
- 中文 (Trung Quốc giản thể)

Chuyển ngôn ngữ real-time qua language switcher trên header, lưu vào `localStorage`.

---

## Quá trình phát triển

Dự án được phát triển qua nhiều phase, mỗi phase xây dựng trên nền phase trước:

### Phase 1-3: Nền tảng

**Commit:** `a4054b9` → `c57697f` → `382221e`

- Tạo tài liệu API từ phân tích response EE88 thực tế
- Backend Express + proxy 1 endpoint (`members`) end-to-end
- Frontend 1 trang (`user.html`) với layui table
- Mở rộng ra 10 endpoint + 12 trang agent
- Dynamic route `/api/data/:endpoint` thay vì hardcode từng route
- Thêm `paramMapper` + `responseNormalizer`
- Trang tỉ lệ hoàn trả (`getRebateOddsPanel`) với giao diện phức tạp

### Phase 4: Tổ chức lại project

**Commit:** `13d988d`

- Di chuyển `build.js` + config ra thư mục gốc
- Cập nhật đường dẫn cross-reference

### Phase 5: Multi-agent + Authentication

**Commit:** `d4945a5` → `480b7c5`

- **Database SQLite** 3 bảng: `hub_users`, `ee88_agents`, `user_agent_permissions`
- **JWT authentication** với login/logout
- **Phân quyền RBAC**: admin thấy tất cả, user chỉ thấy agent được gán
- **Fan-out service**: gọi song song N agent, gộp kết quả
- **Admin pages**: quản lý agents (CRUD + health check) + quản lý users
- **Login page** với dual-card design
- `hub-api.js` auto-attach JWT + redirect khi 401

### UI Refinements: Header migration

**Commit:** `e11f6b9` → `f6fbe92`

Chuyển header từ custom CSS sang layui mặc định:

- `hub-header` → `layui-header` với `layui-layout-admin` wrapper
- `hub-logo` → `layui-logo` (chuẩn layui)
- Thêm `layui-layout-left` / `layui-layout-right` cho header nav
- Dropdown tài khoản: Đổi MK đăng nhập, Đổi MK giao dịch, Đăng xuất
- Thêm `lay-header-event` + `util.event()` pattern cho menu mobile + more options

### UI Refinements: Layui source modifications

**Commit:** `f6fbe92`

Sửa trực tiếp trong source `layui.css` + `layui.js` (minified) thay vì CSS override:

- **Header/logo height**: 60px → 50px
- **Background**: Toàn bộ header + sidebar + logo + dropdown → `#20222A`
- **Nav-bar indicator**: `#16b777` (xanh) → `#ff4d4f` (đỏ) mọi nơi
- **Nav-bar hoạt động với menu cha**: Sửa JS selector thêm `>a` cho mouseenter binding + bỏ condition skip items có children
- **Dropdown dark theme**: bg `#20222A`, border `#2a2d35`, text `#ccc`, active `#ff4d4f`
- **Transitions**: Thêm transition cho logo width, sidebar width, body left, layout-left

### UI Refinements: Tooltips + Collapsed state

**Commit:** `c9f7550`

- `layer.tips()` cho header buttons (toggle, refresh, fullscreen)
- `layer.tips()` cho sidebar menu khi collapsed (hiện tên menu khi hover icon)
- Sidebar collapsed animation mượt với CSS transition

### UI Refinements: i18n + Language switcher

**Commit:** `5f6ffd1`

- Hệ thống i18n hoàn chỉnh qua `hub-lang.js` (VI/EN/ZH)
- Language switcher trên header với flag icon
- `data-i18n` attribute trên DOM elements
- Context menu tabs cũng đa ngôn ngữ
- `HubLang.applyDOM()` update toàn bộ text khi chuyển ngôn ngữ

### UI Refinements: Icon + Build script

**Commit:** `c37957d`

- Dropdown icon: `layui-icon-down` → `layui-icon-triangle-d` (tam giác, đẹp hơn)
- CSS nav-more: `font-size: 16px`, căn giữa vertical với `margin: auto 0`
- Dropdown active color: `#fff` → `#ff4d4f` (trùng sidebar)
- Dropdown tài khoản: Thông tin tài khoản, Cài đặt, Đăng xuất
- Flag ảnh cho language switcher (vn.gif, uk.gif, china.gif)
- Build script: tự kill server → build → restart với console `stdio: inherit`

---

## Ghi chú kỹ thuật

### Layui source đã tuỳ chỉnh

File `client/lib/layui/css/layui.css` và `client/lib/layui/layui.js` đã được sửa trực tiếp (minified). Repo tham khảo source chưa minify: [FixLayui](https://github.com/Cauuthpzx/FixLayui).

Danh sách thay đổi trong source:

| File | Thay đổi | Giá trị |
|------|---------|---------|
| layui.css | Header height | 60px → 50px |
| layui.css | Logo line-height | 60px → 50px |
| layui.css | Nav-item line-height | 60px → 50px |
| layui.css | Header background | `#23292e` → `#20222A` |
| layui.css | Nav-bar color (3 chỗ) | `#16b777` → `#ff4d4f` |
| layui.css | Nav-child background | `#fff` → `#20222A` |
| layui.css | Nav-child border | `#eee` → `#2a2d35` |
| layui.css | Nav-child link color | `#5f5f5f` → `#ccc` |
| layui.css | Nav-child active | `#f8f8f8` → `rgba(255,255,255,.08)` + `#ff4d4f` |
| layui.css | Nav-child top | 65px → 50px |
| layui.css | Nav-more font-size | 12px → 16px |
| layui.css | Nav-more position | right:3px → right:-2px, thêm bottom:0, margin:auto 0 |
| layui.css | Transitions | Thêm cho logo, side, body, layout-left |
| layui.js | NAV_DOWN icon | `layui-icon-down` → `layui-icon-triangle-d` |
| layui.js | Nav-bar mouseenter | Thêm `>a` vào selector |
| layui.js | Nav-bar condition | Bỏ `n[0]||` skip parent items |

### Database

- SQLite với WAL mode cho concurrent access
- Auto-seed admin user khi DB trống
- Auto-migrate agent từ `.env` khi chưa có agent nào
- Foreign keys enabled, cascade delete

### Build script

`scripts/build.js` — chạy từ thư mục gốc `PROJECT 1`:

```bash
node scripts/build.js          # Build + tự restart server
node scripts/build.js --no-restart  # Chỉ build
```

Flow: tìm server (netstat) → kill (taskkill) → đợi tắt → xoá dist → copy source → restart với `stdio: inherit`.

---

## License

Private project.
