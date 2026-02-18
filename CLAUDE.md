# CLAUDE.md — Quy tắc dự án

## Git commit

- **Chỉ commit source** (`Project_EE88/client/`, `Project_EE88/server/`, `scripts/`)
- **KHÔNG commit dist/** — thư mục `Project_EE88/dist/` là output build, đã nằm trong `.gitignore`

## Build

- Chạy từ root: `node scripts/build.js`
- Output: `Project_EE88/dist/`

## Dual Frontend (QUAN TRỌNG)

- Web có **2 phiên bản frontend** chạy song song:
  - `client/pages/` — Phiên bản iframe (admin.html load các page qua iframe)
  - `spa/` — Phiên bản SPA (index.html + hub-router.js load JS modules từ `spa/js/pages/`)
- **MỌI tính năng mới PHẢI được implement cho CẢ 2 phiên bản**
- **Test CẢ 2** để đảm bảo đầy đủ, không bỏ sót bên nào
- Menu item: iframe dùng `data-url`, SPA dùng `data-page`
- SPA page module pattern: `SpaPages.pageName = { getHTML(), init(container), destroy(), onLangChange(container) }`

## Cấu trúc

```
PROJECT 1/
├── Project_EE88/
│   ├── client/          ← SOURCE frontend (commit)
│   ├── server/          ← SOURCE backend (commit)
│   └── dist/            ← BUILD output (KHÔNG commit)
├── scripts/
│   └── build.js         ← Build script (commit)
└── package.json
```
