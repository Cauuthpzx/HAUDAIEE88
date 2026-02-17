# Chi tiết 11 Endpoint ee88

> Base URL: `https://a2u4k.ee88dly.com`
> Method: POST, params qua query string
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

```
POST /agent/getRebateOddsPanel.html
```

**LƯU Ý:** Success code = `1` (không phải 0)

**Search params:** `type`, `series_id`, `lottery_id`

**Response:** Cấu trúc đặc biệt (series → lotteries → play_types), không phải data[] table.

**Không cache** vào DB.

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

| # | Endpoint | Fields | Rows (test) | total_data |
|---|----------|--------|-------------|------------|
| 1 | members | 43 | 20,793 | Không |
| 2 | invites | 14 | 1 | Không |
| 3 | banks | 6 | 0 | Không |
| 4 | rebate | nested | — | Không |
| 5 | report-lottery | 12 | 2 | 8 fields |
| 6 | report-funds | 15 | 67 | 9 fields |
| 7 | report-third | 9 | 44 | 6 fields |
| 8 | deposits | 39 | 28 | Không |
| 9 | withdrawals | 39 | 5 | Không |
| 10 | bets | 38 | 31 | form_data |
| 11 | bet-orders | 14 | 13,138 | Không |

## Lưu ý chung

- **Tiền tệ**: Tất cả giá trị tiền là string với 4 decimal places: `"300000.0000"`
- **user_tree**: Mảng hoặc JSON string chứa chain agent IDs
- **bet_data_set**: Object phức tạp — cần `JSON.stringify()` khi lưu DB
- **rebate_arr**: String JSON — cần `JSON.parse()` khi sử dụng
- **Sensitive data**: members trả cả `password` (bcrypt hash), `salt`, `fund_password`
- **Timeout**: bet-orders cần ≥30s, các endpoint khác 15s đủ
