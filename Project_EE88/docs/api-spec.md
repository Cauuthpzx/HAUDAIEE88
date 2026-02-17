# Agent Hub — API Specification

> Phase 1: Hiểu nguồn dữ liệu trước khi code

---

## Tổng quan

**Nguồn dữ liệu**: ee88 Agent Dashboard
**Base URL**: `https://a2u4k.ee88dly.com`
**Xác thực**: Cookie `PHPSESSID` (lấy từ quá trình login)
**Method**: Tất cả endpoint đều dùng `POST`
**Params**: Data endpoints gửi qua query string; Action endpoints (Nhóm 1b) gửi qua POST body (form-urlencoded)
**Response format**: JSON

---

## Cách gọi API

```
POST {BASE_URL}{endpoint_path}?{query_string}
```

### Headers bắt buộc

```
Cookie: PHPSESSID={session_value}
X-Requested-With: XMLHttpRequest
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
```

### Query params chung

| Param   | Kiểu   | Mô tả                                       |
| ------- | ------ | -------------------------------------------- |
| `page`  | number | Trang hiện tại (mặc định: 1)                |
| `limit` | number | Số dòng mỗi trang (mặc định: 10, max: 500) |

### Response format chung

```json
{
  "code": 0,
  "msg": "",
  "count": 150,
  "data": [{}, {}],
  "total_data": {},
  "hsDateTime": "2026-02-17 10:30:00"
}
```

| Field        | Mô tả                                            |
| ------------ | ------------------------------------------------- |
| `code`       | 0 = thành công (riêng rebate dùng 1)             |
| `msg`        | Thông báo lỗi (nếu có)                           |
| `count`      | Tổng số dòng (dùng cho phân trang)               |
| `data`       | Mảng dữ liệu                                     |
| `total_data` | Dữ liệu tổng hợp (chỉ có ở report endpoints)    |

### Session expired detection

Khi cookie hết hạn, ee88 trả về:

```json
{ "code": 0, "msg": "Vui lòng đăng nhập trước", "url": "/agent/login" }
```

---

## Phân loại Endpoint

### Nhóm 1: Không có date filter

| Key       | URL                              | Mô tả            |
| --------- | -------------------------------- | ----------------- |
| `members` | `/agent/user.html`               | Danh sách hội viên |
| `invites` | `/agent/inviteList.html`         | Mã mời            |
| `banks`   | `/agent/bankList.html`           | Thẻ ngân hàng     |

### Nhóm 1b: Action endpoints (POST body, không phải query string)

| Key                  | URL                              | Mô tả                        |
| -------------------- | -------------------------------- | ----------------------------- |
| `getLottery`         | `/agent/getLottery`              | Lấy danh sách series + xổ số |
| `getRebateOddsPanel` | `/agent/getRebateOddsPanel`     | Bảng tỉ lệ hoàn trả          |
| `editPassword`       | `/agent/editPassword`           | Đổi mật khẩu đăng nhập       |
| `editFundPassword`   | `/agent/editFundPassword`       | Đổi mật khẩu rút tiền        |

> **Lưu ý:** Nhóm 1b gửi params qua POST body (form-urlencoded), KHÔNG qua query string. Success code = `1` (không phải 0). Proxy qua `/api/action/:action`.

### Nhóm 2: Date filter qua param `date` (format: `YYYY-MM-DD | YYYY-MM-DD`)

| Key              | URL                          | Mô tả                   |
| ---------------- | ---------------------------- | ------------------------ |
| `report-lottery` | `/agent/reportLottery.html`  | Báo cáo xổ số           |
| `report-funds`   | `/agent/reportFunds.html`    | Sao kê giao dịch        |
| `report-third`   | `/agent/reportThirdGame.html`| Báo cáo nhà cung cấp    |

### Nhóm 3: Date filter qua param `create_time`

| Key           | URL                                  | Mô tả            |
| ------------- | ------------------------------------ | ----------------- |
| `deposits`    | `/agent/depositAndWithdrawal.html`   | Nạp/rút tiền      |
| `withdrawals` | `/agent/withdrawalsRecord.html`      | Lịch sử rút tiền  |
| `bets`        | `/agent/bet.html`                    | Đơn cược xổ số    |

### Nhóm 4: Date filter qua param `bet_time`

| Key          | URL                    | Mô tả               |
| ------------ | ---------------------- | -------------------- |
| `bet-orders` | `/agent/betOrder.html` | Đơn cược bên thứ 3  |

---

## Tham khảo chi tiết

- [endpoints.md](./endpoints.md) — Chi tiết params + response fields từng endpoint
- [auth-flow.md](./auth-flow.md) — Luồng đăng nhập, captcha, cookie lifecycle
- [data-schema.md](./data-schema.md) — Schema dữ liệu cho database cache
- [sample-responses/](./sample-responses/) — JSON response mẫu
