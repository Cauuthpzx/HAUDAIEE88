# Luồng đăng nhập ee88 Agent

---

## Tổng quan

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION FLOW                           │
│                                                                  │
│  Step 1: POST /agent/login { scene: "init" }                   │
│          → { code: 1, public_key: "-----BEGIN PUBLIC KEY..." }  │
│                                                                  │
│  Step 2: GET /agent/captcha                                      │
│          → image/png (4 ký tự chữ + số)                         │
│                                                                  │
│  Step 3: ddddocr giải captcha (Python)                           │
│          Tỷ lệ đúng ~50-70%, retry tối đa 10 lần               │
│                                                                  │
│  Step 4: POST /agent/login                                       │
│          { username, password(RSA encrypted), captcha }          │
│          → Thành công: PHPSESSID cookie giữ nguyên              │
│          → Thất bại captcha: retry từ Step 2                    │
│                                                                  │
│  Step 5: Dùng PHPSESSID cho tất cả API requests                │
│          Cookie: PHPSESSID=xxx                                   │
│          Session hết hạn: ~1 năm                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Chi tiết từng bước

### Step 1: Lấy RSA Public Key

```http
POST https://a2u4k.ee88dly.com/agent/login
Content-Type: application/x-www-form-urlencoded

scene=init
```

Response:
```json
{
  "code": 1,
  "public_key": "-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSq...\n-----END PUBLIC KEY-----"
}
```

### Step 2: Lấy Captcha

```http
GET https://a2u4k.ee88dly.com/agent/captcha
Cookie: PHPSESSID=<session từ step 1>
```

Response: `image/png` — Ảnh captcha 4 ký tự

### Step 3: Giải Captcha (Python ddddocr)

```python
import ddddocr
ocr = ddddocr.DdddOcr(show_ad=False)
result = ocr.classification(captcha_image_bytes)  # "a3k9"
```

### Step 4: Gửi Login

```http
POST https://a2u4k.ee88dly.com/agent/login
Cookie: PHPSESSID=<session từ step 1>

username=agent01&password=<RSA encrypted>&captcha=a3k9
```

Thành công: `{ "code": 1, "msg": "Đăng nhập thành công", "url": "/agent/index" }`
Sai captcha: `{ "code": 0, "msg": "Mã xác nhận không đúng" }` → retry Step 2
Sai password: `{ "code": 0, "msg": "Mật khẩu không đúng" }`

---

## RSA Encryption

```python
from Crypto.PublicKey import RSA
from Crypto.Cipher import PKCS1_v1_5
import base64

key = RSA.import_key(public_key_pem)
cipher = PKCS1_v1_5.new(key)
encrypted = cipher.encrypt(password.encode('utf-8'))
password_encrypted = base64.b64encode(encrypted).decode('utf-8')
```

---

## Cookie Lifecycle

| Giai đoạn   | Mô tả                                                    |
| ----------- | --------------------------------------------------------- |
| Tạo mới     | Login thành công → PHPSESSID                              |
| Thời hạn    | ~1 năm (server-side)                                      |
| Hết hạn     | API trả `{ code: 0, url: "/agent/login" }`               |
| Bị kick     | Nếu đăng nhập từ nơi khác                                |
| Health check| Gọi `/agent/user.html?page=1&limit=1` → code=0 + no url  |

### Session Expired Detection

```javascript
function isSessionExpired(body) {
  if (!body) return true;
  if (body.code === 0 && body.url === '/agent/login') return true;
  if (body.code === 0 && body.msg && body.msg.includes('đăng nhập')) return true;
  return false;
}
```

---

## Python Captcha Solver Service (Flask, port 5000)

**POST /login:**
```json
// Request
{ "base_url": "https://a2u4k.ee88dly.com", "username": "agent01", "password": "pass123", "max_retries": 10 }

// Response OK
{ "success": true, "phpsessid": "abc123def456", "attempts": 3 }

// Response FAIL
{ "success": false, "error": "Mật khẩu không đúng", "attempts": 1 }
```

**GET /health:** `{ "status": "ok" }`

**Python deps:** `flask`, `requests`, `ddddocr`, `pycryptodome`

---

## Tóm tắt

1. Login cần **Python service riêng** (ddddocr không có Node.js)
2. **1 PHPSESSID** = 1 tài khoản agent = quyền xem data hội viên thuộc agent đó
3. **N agents** = N PHPSESSIDs = gọi song song N API → gộp kết quả
4. Session hết hạn → gọi lại Python solver → PHPSESSID mới
5. Nên **health check cron** mỗi 30 phút
