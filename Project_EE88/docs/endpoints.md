# Chi tiết 13 Endpoint ee88

> Base URL: `https://a2u4k.ee88dly.com`
> Method: POST — Data endpoints gửi params qua query string, Action endpoints gửi qua POST body
> Verified: 2026-02-17 (test thực tế với PHPSESSID)

---

## 1. members — Danh sách hội viên

```
POST /agent/user.html?page=1&limit=500
```

**Search params:** `username`, `status` (0=Chưa đánh giá, 1=Bình thường, 2=Đóng băng, 3=Khoá), `sort_field` (money/login_time/register_time/deposit_money/withdrawal_money), `sort_direction` (asc/desc), `first_deposit_time`

**Response fields (43 fields):**
`id`, `username`, `user_parent`, `user_tree`, `level`, `salt`, `password`, `fund_password`, `type`, `group_id`, `status`, `login_ip`, `useragent`, `device`, `login_time`, `register_time`, `truename`, `phone`, `email`, `email_verified`, `remark`, `note`, `invite_code`, `phone_verified`, `phone_verified_time`, `agent_type`, `is_tester`, `first_deposit_time`, `create_time`, `update_time`, `money`, `deposit_times`, `deposit_money`, `withdrawal_times`, `withdrawal_money`, `type_format`, `parent_user`, `deposit_count`, `deposit_amount`, `withdrawal_count`, `withdrawal_amount`, `status_format`, `uid`

**Ghi chú fields:**
- `user_parent` (int) — ID agent cha
- `user_tree` (string) — Chuỗi JSON mảng agent chain, vd: `"[1758915]"`
- `salt`, `password`, `fund_password` — Dữ liệu nhạy cảm (hash bcrypt)
- `deposit_times` / `deposit_money` — Tên gốc từ DB
- `deposit_count` / `deposit_amount` — Alias format cho hiển thị
- `type_format` — "Hội viên" / "Đại lý"
- `status_format` — "Bình thường" / "Đóng băng" / "Khoá"
- `is_tester` (int) — 0 = thật, 1 = tester
- Tiền format: `"5230.5000"` (4 decimal places, kiểu string)

**total_data:** Không có | **Sort mặc định:** `login_time` DESC | **Test count:** 20,793

---

## 2. invites — Mã mời

```
POST /agent/inviteList.html?page=1&limit=500
```

**Search params:** `create_time` (YYYY-MM-DD | YYYY-MM-DD), `user_register_time`, `invite_code`

**Response fields (14 fields):**
`id`, `uid`, `invite_code`, `group_id`, `user_type`, `rebate_arr`, `reg_count`, `remark`, `create_time`, `update_time`, `recharge_count`, `first_recharge_count`, `register_recharge_count`, `scope_reg_count`

**Ghi chú fields:**
- `rebate_arr` (string) — JSON object chứa hoàn trả theo series, vd: `"{\"1\": {\"value\": 10, \"series_id\": \"1\"}, \"2\": {\"value\": 10, \"series_id\": \"2\"}}"`
- `user_type` (string) — "Hội viên thường"
- `update_time` — Thời gian cập nhật cuối

**total_data:** Không có | **Sort mặc định:** `create_time` DESC

---

## 3. banks — Thẻ ngân hàng

```
POST /agent/bankList.html?page=1&limit=500
```

**Search params:** `card_number`

**Response fields (6 fields):**
`id`, `is_default`, `bank`, `branch`, `card_number`, `create_time`

**Ghi chú fields:**
- `is_default` (int) — 1 = thẻ mặc định, 0 = thẻ phụ
- Test trả 0 rows (agent chưa có thẻ ngân hàng)

**total_data:** Không có | **Sort mặc định:** `create_time` DESC

---

## 4. rebate — Bảng hoàn trả

> **LƯU Ý:** Nhóm endpoint này dùng 2 API hỗ trợ nhau, cả 2 đều POST với body form-urlencoded (KHÔNG phải query string). Success code = `1` (không phải 0). **Không cache** vào DB.

### 4a. getLottery — Lấy danh sách xổ số

```
POST /agent/getLottery
Content-Type: application/x-www-form-urlencoded
Body: type=init
```

**Body params:**

| Param       | Kiểu   | Bắt buộc | Mô tả                                              |
| ----------- | ------ | -------- | --------------------------------------------------- |
| `type`      | string | Có       | `init` = lần đầu load, `getLottery` = đổi series    |
| `series_id` | number | Không    | Bắt buộc khi `type=getLottery`, ID series cần lấy   |

**Response:**

```json
{
  "code": 1,
  "msg": "",
  "data": {
    "seriesData": [
      { "id": 1, "name": "Miền Nam" },
      { "id": 2, "name": "Miền Bắc" },
      { "id": 3, "name": "Miền Trung" },
      { "id": 6, "name": "Xổ số nhanh" },
      { "id": 7, "name": "Keno" },
      { "id": 8, "name": "Xổ số cào" },
      { "id": 9, "name": "Sicbo" },
      { "id": 10, "name": "pk" },
      { "id": 11, "name": "Wingo" }
    ],
    "lotteryData": [
      { "id": 1, "name": "Bạc Liêu", "series_id": 1 },
      { "id": 2, "name": "Vũng Tàu", "series_id": 1 }
    ],
    "tableHead": [
      { "title": "Kiểu chơi", "field": "odds_11" },
      { "title": "Hoàn trả 10", "field": "odds_10" }
    ],
    "tableBody": [
      ["Lô 2 Số", 99.5, 99.401, 99.301, "..."],
      ["Lô 3 Số", 980, 979.02, 978.04, "..."]
    ],
    "firsSeriesId": 1,
    "firsLotteryId": 1
  }
}
```

**Response fields:**

| Field            | Kiểu    | Mô tả                                                         |
| ---------------- | ------- | -------------------------------------------------------------- |
| `seriesData`     | array   | Danh sách series xổ số (luôn trả đủ 9 series)                |
| `seriesData[].id`| number  | ID series                                                      |
| `seriesData[].name`| string| Tên series (Miền Nam/Bắc/Trung, Xổ số nhanh, Keno...)       |
| `lotteryData`    | array   | Danh sách xổ số thuộc series đang chọn                        |
| `lotteryData[].id`| number | ID xổ số                                                      |
| `lotteryData[].name`| string| Tên xổ số (Bạc Liêu, Miền Bắc VIP 45 giây...)              |
| `lotteryData[].series_id`| number | ID series mà xổ số thuộc về                           |
| `tableHead`      | array   | Header bảng tỉ lệ (11 cột: 1 cột tên + 10 cột hoàn trả)    |
| `tableBody`      | array   | Dữ liệu bảng, mỗi row là array: [tên_kiểu_chơi, odds...]    |
| `firsSeriesId`   | number  | ID series mặc định đang chọn                                  |
| `firsLotteryId`  | number  | ID xổ số mặc định đang chọn                                   |

**Ghi chú:**
- `type=init`: Trả đầy đủ seriesData + lotteryData + tableHead + tableBody cho series đầu tiên
- `type=getLottery`: Trả lotteryData mới theo `series_id` + tableHead + tableBody cho lottery đầu tiên trong series đó
- `tableBody` mỗi row: phần tử đầu là tên kiểu chơi (string), 10 phần tử sau là tỉ lệ odds (number)
- Số lượng kiểu chơi thay đổi theo series (Miền Nam ~40 kiểu, Miền Bắc ~44 kiểu)

### 4b. getRebateOddsPanel — Lấy bảng tỉ lệ hoàn trả theo xổ số

```
POST /agent/getRebateOddsPanel
Content-Type: application/x-www-form-urlencoded
Body: lottery_id=1&series_id=1
```

**Body params:**

| Param        | Kiểu   | Bắt buộc | Mô tả                           |
| ------------ | ------ | -------- | -------------------------------- |
| `lottery_id` | number | Có       | ID xổ số (lấy từ lotteryData)   |
| `series_id`  | number | Có       | ID series (lấy từ seriesData)    |

**Response:**

```json
{
  "code": 1,
  "msg": "",
  "data": {
    "tableHead": [
      { "title": "Kiểu chơi", "field": "odds_11" },
      { "title": "Hoàn trả 10", "field": "odds_10" },
      { "title": "Hoàn trả 9", "field": "odds_9" },
      { "title": "Hoàn trả 8", "field": "odds_8" },
      { "title": "Hoàn trả 7", "field": "odds_7" },
      { "title": "Hoàn trả 6", "field": "odds_6" },
      { "title": "Hoàn trả 5", "field": "odds_5" },
      { "title": "Hoàn trả 4", "field": "odds_4" },
      { "title": "Hoàn trả 3", "field": "odds_3" },
      { "title": "Hoàn trả 2", "field": "odds_2" },
      { "title": "Hoàn trả 1", "field": "odds_1" }
    ],
    "tableBody": [
      ["Lô 2 Số", 99.5, 99.401, 99.301, 99.202, 99.102, 99.003, 98.903, 98.804, 98.704, 98.605],
      ["Lô 3 Số", 980, 979.02, 978.04, 977.06, 976.08, 975.1, 974.12, 973.14, 972.16, 971.18]
    ]
  }
}
```

**Ghi chú:**
- Chỉ trả `tableHead` + `tableBody` (không có seriesData/lotteryData)
- `tableHead` luôn 11 cột: cột đầu "Kiểu chơi", 10 cột hoàn trả giảm dần (10 → 1)
- `tableBody` mỗi row: `[tên_kiểu_chơi, odds_10, odds_9, ..., odds_1]`
- Giá trị odds là number (float), không phải string
- Dùng khi user chọn xổ số khác trong cùng series (không cần gọi lại getLottery)

### Danh sách Series và Lottery IDs (verified)

| Series ID | Tên          | Lottery IDs mẫu                                    |
| --------- | ------------ | --------------------------------------------------- |
| 1         | Miền Nam     | 1-17, 42-44, 57-60 (24 xổ số, gồm VIP 45s/1p/90s/2p/5p) |
| 2         | Miền Bắc     | 32, 45-49 (6 xổ số, gồm VIP nhanh 3p/5p/45s/75s/2p) |
| 3         | Miền Trung   | (tương tự cấu trúc Miền Nam)                       |
| 6         | Xổ số nhanh  | (xổ số nhanh VIP)                                   |
| 7         | Keno         | (Keno games)                                        |
| 8         | Xổ số cào    | (Scratch lottery)                                   |
| 9         | Sicbo        | (Sicbo games)                                       |
| 10        | pk           | (PK games)                                          |
| 11        | Wingo        | (Wingo games)                                       |

### Kiểu chơi phổ biến (từ tableBody)

Lô: Lô 2 Số, Lô 2 Số 1K, Lô 2 Số Đầu, Lô 3 Số, Lô 4 Số, Lô 2 Số Giải ĐB
Xiên: Xiên 2, Xiên 3, Xiên 4
Đề: Đề đầu, Đề đặc biệt, Đề đầu đuôi, Đề đầu đặc biệt, Đề Giải 7, Đề giải nhất, Đề đầu giải nhất
Đầu/Đuôi: Đầu, Đuôi
Càng: 3 Càng Đầu, 3 Càng Đặc Biệt, 3 Càng Đầu Đuôi, 3 càng giải nhất, 4 Càng Đặc Biệt
Trượt xiên: Trượt xiên 4, Trượt xiên 8, Trượt xiên 10
Khác: Kèo đôi, Đặc sắc-Số Đơn, Đặc sắc-Kèo đôi, Tổng 0-18

**Lưu ý:** Mỗi series/lottery có tập kiểu chơi khác nhau. Miền Bắc có thêm "Lô 2 Số Đầu", "Đề đầu đặc biệt", "Đặc sắc-Số Đơn" mà Miền Nam không có.

---

## 5. report-lottery — Báo cáo xổ số

```
POST /agent/reportLottery.html?page=1&limit=500&date=2026-02-10 | 2026-02-17
```

**Date param:** `date`

**Search params:** `date`, `lottery_id`, `username`

**Response fields (12 fields):**
`uid`, `lottery_id`, `bet_count`, `bet_amount`, `valid_amount`, `rebate_amount`, `result`, `win_lose`, `prize`, `username`, `user_parent_format`, `lottery_name`

**Ghi chú fields:**
- Tất cả tiền đều string 4 decimal: `"300000.0000"`
- `lottery_name` — Tên xổ số, vd: "Miền Bắc VIP 45 giây"
- `user_parent_format` — Tên agent cha

**total_data (8 fields):** `total_bet_count`, `total_bet_amount`, `total_valid_amount`, `total_rebate_amount`, `total_result`, `total_win_lose`, `total_prize`, `total_bet_number`

---

## 6. report-funds — Sao kê giao dịch

```
POST /agent/reportFunds.html?page=1&limit=500&date=2026-02-10 | 2026-02-17
```

**Date param:** `date`

**Search params:** `date`, `username`

**Response fields (15 fields):**
`id`, `uid`, `user_parent`, `date`, `deposit_count`, `deposit_amount`, `withdrawal_count`, `withdrawal_amount`, `charge_fee`, `agent_commission`, `promotion`, `third_rebate`, `username`, `user_parent_format`, `third_activity_amount`

**Ghi chú fields:**
- `user_parent` (int) — ID agent cha (thêm so với docs cũ)
- `id` (int) — ID record (thêm so với docs cũ)
- `third_activity_amount` (int) — Hoạt động bên thứ 3

**total_data (9 fields):** `total_deposit_count`, `total_deposit_amount`, `total_withdrawal_count`, `total_withdrawal_amount`, `total_charge_fee`, `total_agent_commission`, `total_promotion`, `total_third_rebate`, `third_activity_amount`

---

## 7. report-third — Báo cáo nhà cung cấp game

```
POST /agent/reportThirdGame.html?page=1&limit=500&date=2026-02-10 | 2026-02-17
```

**Date param:** `date`

**Search params:** `date`, `username`, `platform_id`

**Danh sách platform_id:**
8=PA, 9=BBIN, 10=WM, 14=MINI, 20=KY, 28=PGSOFT, 29=LUCKYWIN, 30=SABA, 31=PT, 38=RICH88, 43=ASTAR, 45=FB, 46=JILI, 47=KA, 48=MW, 50=SBO, 51=NEXTSPIN, 52=AMB, 53=FunTa, 62=MG, 63=WS168, 69=DG CASINO, 70=V8, 71=AE, 72=TP, 73=FC, 74=JDB, 75=CQ9, 76=PP, 77=VA, 78=BNG, 84=DB CASINO, 85=EVO CASINO, 90=CMD SPORTS, 91=PG NEW, 92=FBLIVE, 93=ON CASINO, 94=MT, 102=FC NEW

**Response fields (9 fields):**
`uid`, `platform_id`, `t_bet_amount`, `t_bet_times`, `t_turnover`, `t_prize`, `t_win_lose`, `username`, `platform_id_name`

**Ghi chú fields:**
- Không có `user_parent_format` (khác với report-lottery và report-funds)
- `platform_id_name` — Tên platform, vd: "JILI", "PGSOFT", "AE"

**total_data (6 fields):** `total_bet_amount`, `total_turnover`, `total_prize`, `total_win_lose`, `total_bet_times`, `total_bet_number`

---

## 8. deposits — Nạp/Rút tiền

```
POST /agent/depositAndWithdrawal.html?page=1&limit=500&create_time=2026-02-10 | 2026-02-17
```

**Date param:** `create_time`

**Search params:** `create_time`, `username`, `type` (1=nạp, 2=rút), `status` (0=chờ, 1=hoàn tất, 2=đang xử lí, 3=thất bại)

**Response fields (39 fields):**
`id`, `serial_no`, `uid`, `user_parent`, `user_tree`, `group_id`, `amount`, `true_amount`, `firm_fee`, `user_fee`, `rebate`, `name`, `bank_id`, `branch`, `account`, `transfer_time`, `remark`, `user_remark`, `status`, `prostatus`, `operator`, `prize_amount`, `activity_id`, `extra`, `category_id`, `merchant_id`, `pay_type`, `trade_id`, `is_tester`, `success_time`, `review_time`, `transfer_record`, `currency`, `create_time`, `update_time`, `username`, `user_parent_format`, `type`

**Ghi chú fields:**
- `user_tree` (array) — Mảng agent chain, vd: `[1758915]`
- `group_id` (int) — Nhóm user
- `bank_id` (int) — ID ngân hàng
- `prostatus` (int) — Trạng thái xử lý nội bộ
- `operator` — Người xử lý
- `prize_amount` — Số tiền thưởng kèm
- `activity_id` — ID khuyến mãi
- `extra` — Dữ liệu bổ sung
- `category_id`, `merchant_id`, `pay_type`, `trade_id` — Thông tin kênh thanh toán
- `transfer_time`, `review_time` — Thời gian chuyển + duyệt
- `transfer_record` — Bản ghi chuyển khoản
- `currency` — Loại tiền tệ
- `type` — "1" = nạp, "2" = rút

**total_data:** Không có | **Test count:** 28

---

## 9. withdrawals — Lịch sử rút tiền

```
POST /agent/withdrawalsRecord.html?page=1&limit=500&create_time=2026-02-10 | 2026-02-17
```

**Date param:** `create_time`

**Search params:** `create_time`, `username`, `serial_no`, `status` (0=chờ, 1=hoàn tất, 2=đang xử lí, 3=thất bại)

**Response fields (39 fields):**
`id`, `serial_no`, `uid`, `user_parent`, `user_tree`, `group_id`, `amount`, `true_amount`, `firm_fee`, `user_fee`, `rebate`, `name`, `bank_id`, `branch`, `account`, `transfer_time`, `remark`, `user_remark`, `status`, `prostatus`, `operator`, `prize_amount`, `activity_id`, `extra`, `category_id`, `merchant_id`, `pay_type`, `trade_id`, `is_tester`, `success_time`, `review_time`, `transfer_record`, `currency`, `create_time`, `update_time`, `username`, `user_parent_format`, `status_format`

**Ghi chú fields:**
- Gần giống deposits nhưng thay `type` bằng `status_format`
- `status_format` (string) — "Hoàn tất" / "Chờ xử lí" / "Đang xử lí" / "Thất bại"
- `name` (string) — Tên chủ tài khoản ngân hàng
- `account` (string) — Số tài khoản ngân hàng
- `rebate` — Có thể null

**total_data:** Không có | **Test count:** 5

---

## 10. bets — Đơn cược xổ số

```
POST /agent/bet.html?page=1&limit=500&create_time=2026-02-10 | 2026-02-17
```

**Date param:** `create_time`

**Search params:** `create_time`, `username`, `serial_no`, `lottery_id`, `play_type_id`, `play_id`, `status`

**Response fields (38 fields):**
`id`, `serial_no`, `uid`, `user_parent`, `user_tree`, `bet_data_set`, `issue`, `issue_id`, `lottery_id`, `lottery_name`, `play_id`, `play_type_id`, `odds_id`, `odds`, `content`, `count`, `win_count`, `real_count`, `real_win_count`, `price`, `money`, `rebate`, `rebate_amount`, `result`, `prize`, `status`, `commission_status`, `source`, `prize_time`, `ip`, `is_tester`, `create_time`, `update_time`, `username`, `play_type_name`, `play_name`, `status_text`

**Ghi chú fields:**
- `bet_data_set` (object) — Object phức tạp chứa odds + rebate theo từng cấp agent:
  ```json
  {"1758915": {"odds": 1.999, "rebate": 0.1}, "2078656": {"odds": 1.999, "rebate": 0.1}}
  ```
- `issue` (string) — Kỳ quay, vd: "202602161609"
- `issue_id` (int) — ID kỳ quay
- `odds_id` (int) — ID tỷ lệ cược
- `count`, `win_count`, `real_count`, `real_win_count` — Số lượng con số đặt cược và trúng
- `price` — Đơn giá mỗi con
- `commission_status` — Trạng thái hoa hồng
- `source` — Nguồn đặt cược (web/mobile)
- `ip` — IP đặt cược
- `status` (int) — 0=Chờ, 1=Đã trả thưởng, 2=Không trúng, 3=Huỷ
- `status_text` (string) — "Chờ kết quả" / "Đã trả thưởng" / ...

**summary (form_data):** `total_money`, `total_rebate_amount`, `total_result`

**Lưu ý:** form_data chỉ chứa filter params nếu không có data tổng hợp, vd: `{"create_time":"2026-02-17 | 2026-02-17"}`

**Test count:** 31

---

## 11. bet-orders — Đơn cược bên thứ 3

```
POST /agent/betOrder.html?page=1&limit=500&bet_time=2026-02-10 | 2026-02-17
```

**Date param:** `bet_time`

**Search params:** `bet_time`, `serial_no`, `platform_username`

**Response fields (14 fields):**
`id`, `uid`, `platform_id`, `cid`, `serial_no`, `bet_amount`, `turnover`, `prize`, `win_lose`, `bet_time`, `game_name`, `platform_id_name`, `c_name`, `platform_username`

**Ghi chú fields:**
- `cid` (int) — Category ID (1=Casino, 2=Slot, ...)
- `c_name` (string) — Tên loại game, vd: "Casino", "Slot Game"
- `platform_username` (string) — Username trên platform, vd: "ee88_player001"
- `game_name` (string) — Tên game cụ thể, vd: "Baccarat Classic", "Fortune Tiger"
- `bet_time` (string) — Thời gian cược chính xác, vd: "2026-02-17 03:06:42"
- Timeout khuyến nghị: **30s** (endpoint nặng nhất, test count 13,138 rows)

**total_data:** Không có | **Test count:** 13,138

---

## Tổng hợp fields count

| #  | Endpoint             | Type        | Fields    | Rows (test) | total_data |
|----|----------------------|-------------|-----------|-------------|------------|
| 1  | members              | GET proxy   | 43        | 20,793      | Không      |
| 2  | invites              | GET proxy   | 14        | 1           | Không      |
| 3  | banks                | GET proxy   | 6         | 0           | Không      |
| 4a | getLottery           | POST action | nested    | —           | Không      |
| 4b | getRebateOddsPanel   | POST action | nested    | ~40 rows    | Không      |
| 5  | report-lottery       | GET proxy   | 12        | 2           | 8 fields   |
| 6  | report-funds         | GET proxy   | 15        | 67          | 9 fields   |
| 7  | report-third         | GET proxy   | 9         | 44          | 6 fields   |
| 8  | deposits             | GET proxy   | 39        | 28          | Không      |
| 9  | withdrawals          | GET proxy   | 39        | 5           | Không      |
| 10 | bets                 | GET proxy   | 38        | 31          | form_data  |
| 11 | bet-orders           | GET proxy   | 14        | 13,138      | Không      |

## Proxy Routes tổng hợp

### GET /api/data/:endpoint (proxy.js)
Dùng cho endpoints 1-3, 5-11. Params truyền qua query string.

### POST /api/action/:action (action.js)
Dùng cho endpoints 4a, 4b và các action khác (editPassword, editFundPassword). Params truyền qua POST body (form-urlencoded).

| Action key           | ee88 Path                        | Mô tả                        |
| -------------------- | -------------------------------- | ----------------------------- |
| `getLottery`         | `/agent/getLottery`              | Lấy danh sách series + xổ số |
| `getRebateOddsPanel` | `/agent/getRebateOddsPanel`     | Bảng tỉ lệ hoàn trả          |
| `editPassword`       | `/agent/editPassword`           | Đổi mật khẩu đăng nhập       |
| `editFundPassword`   | `/agent/editFundPassword`       | Đổi mật khẩu rút tiền        |

## Lưu ý chung

- **Tiền tệ**: Tất cả giá trị tiền là string với 4 decimal places: `"300000.0000"`
- **user_tree**: Mảng hoặc JSON string chứa chain agent IDs
- **bet_data_set**: Object phức tạp — cần `JSON.stringify()` khi lưu DB
- **rebate_arr**: String JSON — cần `JSON.parse()` khi sử dụng
- **Sensitive data**: members trả cả `password` (bcrypt hash), `salt`, `fund_password`
- **Timeout**: bet-orders cần ≥30s, các endpoint khác 15s đủ
- **Action endpoints**: getLottery + getRebateOddsPanel dùng POST body (form-urlencoded), success code = `1`, proxy qua `/api/action/`
- **Rebate data**: Giá trị odds là number (float), không phải string. Mỗi series/lottery có tập kiểu chơi khác nhau
