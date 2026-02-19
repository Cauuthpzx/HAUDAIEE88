# CLAUDE.md — Quy tắc dự án

## Git commit

- **Chỉ commit source** (`Project_EE88/client/`, `Project_EE88/server/`, `scripts/`)
- **KHÔNG commit dist/** — thư mục `Project_EE88/dist/` là output build, đã nằm trong `.gitignore`

## Build

- Chạy từ root: `node scripts/build.js`
- Output: `Project_EE88/dist/`
