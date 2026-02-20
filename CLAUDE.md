# CLAUDE.md — Quy tắc dự án

## Git commit

- **Chỉ commit source** (`Project_EE88/client/`, `Project_EE88/server/`, `scripts/`)
- **KHÔNG commit dist/** — thư mục `Project_EE88/dist/` là output build, đã nằm trong `.gitignore`
- **Commit message luôn viết bằng tiếng Việt**
- **Luôn hỏi user trước khi push** — không tự ý push lên remote

## Build

- Chạy từ root: `node scripts/build.js`
- Output: `Project_EE88/dist/`

## i18n

- **Luôn dùng key i18n ngay khi code** — mọi text hiển thị (label, placeholder, message, title…) phải dùng `data-i18n="key"` (HTML) hoặc `HubLang.t('key')` (JS) ngay lúc viết code, không hard-code text rồi bổ sung sau
- Khi thêm key mới, cập nhật cả 3 ngôn ngữ trong `client/js/hub-lang.js` (vi, en, zh-CN)
- Hoàn thiện tính năng = hoàn thiện i18n luôn, không để nợ

## Công thức tính toán — Nguồn dữ liệu

### Bảng dữ liệu chính

| Bảng                  | Ý nghĩa                                  | Dữ liệu mỗi dòng                              |
| --------------------- | ---------------------------------------- | --------------------------------------------- |
| `data_members`        | Danh sách hội viên                       | 1 hội viên                                    |
| `data_report_funds`   | Dữ liệu tổng hợp giao dịch (từ API EE88) | 1 hội viên × 1 ngày × 1 đại lý                |
| `data_report_lottery` | Báo cáo xổ số                            | 1 hội viên × 1 ngày × 1 loại xổ số × 1 đại lý |
| `data_report_third`   | Báo cáo nhà cung cấp (NCC)               | 1 hội viên × 1 ngày × 1 platform × 1 đại lý   |
| `data_bet_orders`     | Đặt cược NCC chi tiết                    | 1 lệnh cược                                   |
| `data_deposits`       | Giao dịch nạp tiền chi tiết              | 1 giao dịch nạp                               |
| `data_withdrawals`    | Giao dịch rút tiền chi tiết              | 1 giao dịch rút                               |

### Quy tắc chọn nguồn dữ liệu

- **Nạp / Rút tiền** → luôn dùng `data_report_funds` (deposit_amount, withdrawal_amount) — KHÔNG dùng data_deposits hay data_withdrawals
- **Cược xổ số** → dùng `data_report_lottery` (bet_amount, win_lose)
- **Cược NCC** → dùng `data_report_third` (t_bet_amount)
- **Thắng/Thua NCC** → dùng `data_bet_orders` (win_lose)
- **Đếm hội viên hoạt động** → DISTINCT uid từ `data_report_lottery` UNION `data_report_third` (không dùng last_login_time)
- **Khách mới** → uid xuất hiện lần đầu trong lottery/third/deposits hôm nay mà CHƯA TỪNG có trước đó
- **Tổng hội viên** → COUNT từ `data_members`
- **Hội viên mới** → COUNT từ `data_members` WHERE register_time trong khoảng
- **Nạp lần đầu** → DISTINCT uid có giao dịch nạp hoàn tất trong khoảng mà trước đó chưa từng nạp (dùng data_deposits)
- **Khoảng thời gian (date_key)** → lưu dạng `YYYY-MM-DD|YYYY-MM-DD`, trích xuất bằng `SUBSTR(date_key, 1, 10)`

### Dashboard — 6 Card KPI (theo khoảng thời gian đã chọn)

| Card            | Công thức                                                                  |
| --------------- | -------------------------------------------------------------------------- |
| Tổng hội viên   | COUNT(\*) từ data_members                                                  |
| Hội viên mới    | COUNT từ data_members WHERE register_time trong khoảng                     |
| Đang hoạt động  | COUNT(DISTINCT uid) từ report_lottery UNION report_third trong khoảng      |
| Tổng nạp        | SUM(deposit_amount) từ data_report_funds trong khoảng                      |
| Tổng rút        | SUM(withdrawal_amount) từ data_report_funds trong khoảng                   |
| Thắng/Thua ròng | SUM(win_lose) từ report_lottery + SUM(win_lose) từ bet_orders trong khoảng |

### Dashboard — Biểu đồ (theo khoảng thời gian)

| Biểu đồ     | Công thức                                                                        |
| ----------- | -------------------------------------------------------------------------------- |
| Cột Nạp/Rút | SUM(deposit_amount) + SUM(withdrawal_amount) từ data_report_funds, GROUP BY ngày |
| Tròn T/T    | abs(win_lose) xổ số vs NCC                                                       |

### Dashboard — Bảng đại lý (luôn tháng hiện tại, không theo bộ chọn)

| Cột                         | Công thức                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| Sale                        | ee88_agents.label                                                                           |
| Dây đại lý                  | ee88_agents.ee88_username                                                                   |
| Cột ngày (10 ngày gần nhất) | COUNT(DISTINCT uid) từ report_lottery UNION report_third ngày đó                            |
| Khách mới hôm nay           | uid lần đầu xuất hiện trong lottery/third/deposits hôm nay (CTE today_uids EXCEPT old_uids) |
| Cược xs hôm nay             | SUM(bet_amount) từ report_lottery hôm nay                                                   |
| Cược NCC hôm nay            | SUM(t_bet_amount) từ report_third hôm nay                                                   |
| Tổng cược xs tháng          | SUM(bet_amount) từ report_lottery cả tháng                                                  |
| Tổng cược NCC tháng         | SUM(t_bet_amount) từ report_third cả tháng                                                  |
| Nạp hôm nay                 | SUM(deposit_amount) từ data_report_funds hôm nay                                            |
| Tổng nạp tháng              | SUM(deposit_amount) từ data_report_funds cả tháng                                           |
| Tổng T/T xổ số              | SUM(win_lose) từ report_lottery cả tháng                                                    |
| Tổng T/T NCC                | SUM(win_lose) từ bet_orders cả tháng                                                        |

### Bộ chọn thời gian nhanh (Dashboard)

| Nút         | Khoảng                                     |
| ----------- | ------------------------------------------ |
| Hôm nay     | today → today                              |
| Hôm qua     | yesterday → yesterday                      |
| Tuần này    | Thứ 2 tuần này → today                     |
| Tháng này   | Ngày 1 tháng này → today                   |
| Tháng trước | Ngày 1 tháng trước → ngày cuối tháng trước |
