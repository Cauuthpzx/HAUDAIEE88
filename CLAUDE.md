# CLAUDE.md — Quy tắc dự án

## Git commit

- **Chỉ commit source** (`Project_EE88/client/`, `Project_EE88/server/`, `scripts/`)
- **KHÔNG commit dist/** — thư mục `Project_EE88/dist/` là output build, đã nằm trong `.gitignore`

## Build

- Chạy từ root: `node scripts/build.js`
- Output: `Project_EE88/dist/`

## i18n

- **Luôn dùng key i18n ngay khi code** — mọi text hiển thị (label, placeholder, message, title…) phải dùng `data-i18n="key"` (HTML) hoặc `HubLang.t('key')` (JS) ngay lúc viết code, không hard-code text rồi bổ sung sau
- Khi thêm key mới, cập nhật cả 3 ngôn ngữ trong `client/js/hub-lang.js` (vi, en, zh-CN)
- Hoàn thiện tính năng = hoàn thiện i18n luôn, không để nợ
