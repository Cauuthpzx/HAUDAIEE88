# Single-Panel Date Range Picker

> Chọn khoảng ngày trên 1 bảng lịch duy nhất (thay vì 2 panel mặc định của laydate)

---

## Cách hoạt động

- Dựa trên laydate built-in: `range: true` + `rangeLinked: true`
- CSS class `laydate-single-panel` ẩn panel thứ 2, giữ nguyên logic chọn range
- Click 1: chọn ngày bắt đầu (hiển thị **đậm**)
- Click 2: chọn ngày kết thúc (hiển thị **đậm**), dải ngày ở giữa tô **nhạt màu**
- Điều hướng tháng/năm đầy đủ trên 1 panel

---

## Files đã sửa

| File | Thay đổi |
|------|----------|
| `client/lib/layui/css/layui.css` | Thêm CSS cuối file (block `laydate-single-panel`) |
| `client/js/hub-api.js` | Thêm `HubAPI.singleRangePicker()` |

---

## Sử dụng

### Cơ bản

```javascript
layui.use(['laydate'], function () {
  var laydate = layui.laydate;

  HubAPI.singleRangePicker('#dateRange', {
    max: 0,                              // không cho chọn tương lai
    value: '2026-02-17 | 2026-02-17'     // giá trị mặc định
  });
});
```

### Với callback

```javascript
HubAPI.singleRangePicker('#dateRange', {
  max: 0,
  value: defaultRange,
  done: function (value, date, endDate) {
    console.log('Đã chọn:', value);      // "2026-02-10 | 2026-02-17"
  }
});
```

### HTML input

```html
<input type="text" id="dateRange" placeholder="Bắt đầu - Kết thúc"
       class="layui-input" readonly autocomplete="off">
```

---

## API

### `HubAPI.singleRangePicker(elem, opts)`

| Param | Type | Mô tả |
|-------|------|--------|
| `elem` | `string` | CSS selector, vd: `'#dateRange'` |
| `opts` | `object` | Options laydate bổ sung (xem bên dưới) |

**Options hỗ trợ** (kế thừa từ laydate):

| Option | Type | Default | Mô tả |
|--------|------|---------|--------|
| `max` | `number\|string` | — | Ngày tối đa (`0` = hôm nay) |
| `min` | `number\|string` | — | Ngày tối thiểu |
| `value` | `string` | — | Giá trị mặc định (`'YYYY-MM-DD \| YYYY-MM-DD'`) |
| `separator` | `string` | `'\|'` | Ký tự phân cách start/end |
| `done` | `function` | — | Callback khi xác nhận |
| `change` | `function` | — | Callback khi thay đổi |
| `ready` | `function` | — | Callback khi picker mở |
| `format` | `string` | `'yyyy-MM-dd'` | Format ngày |

**Return**: laydate instance

---

## CSS Classes

```
laydate-single-panel          — class gắn vào picker element
├── ẩn .laydate-main-list-1   — ẩn panel thứ 2
├── td.layui-this > div       — font-weight: 700 (ngày đầu/cuối đậm)
└── td.laydate-selected > div — background: rgba(22,183,119,.15) (dải nhạt)
```

---

## So sánh 2 kiểu

| | laydate mặc định (`range: true`) | Single-panel (`singleRangePicker`) |
|---|---|---|
| Số panel | 2 (tháng hiện tại + tháng kế) | 1 |
| Width | 546px | ~272px |
| Chọn range | Click panel trái → click panel phải | Click 1 → Click 2 trên cùng panel |
| Điều hướng | Mỗi panel có nút riêng | 1 bộ nút đầy đủ |
| Highlight | Dải xanh nhạt giữa 2 ngày | Giống |

---

## Lưu ý

- Kết hợp được với quick date select dropdown (Hôm nay, Hôm qua, Tuần này...)
- Format output giống hệt laydate range: `'YYYY-MM-DD | YYYY-MM-DD'`
- Backend parse bình thường, không cần thay đổi
- Nếu upgrade layui, cần thêm lại CSS block vào cuối `layui.css`
