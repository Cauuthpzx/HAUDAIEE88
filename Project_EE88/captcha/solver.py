"""
EE88 Auto-Login — Captcha Solver Service

Endpoints:
  POST /login   → { success, phpsessid, cookies, user_agent, attempts }
  GET  /health  → { status: "ok" }

Deps: pip install flask cloudscraper ddddocr pycryptodome
"""

import base64, logging, sys, traceback
import cloudscraper, ddddocr
from Crypto.Cipher import PKCS1_v1_5
from Crypto.PublicKey import RSA
from flask import Flask, jsonify, request

app = Flask(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("solver")

ocr = ddddocr.DdddOcr(show_ad=False)
log.info("OCR engine đã sẵn sàng")


def rsa_encrypt(password, public_key_pem):
    if "-----BEGIN" in public_key_pem and "\n" not in public_key_pem:
        public_key_pem = public_key_pem.replace(
            "-----BEGIN PUBLIC KEY-----", "-----BEGIN PUBLIC KEY-----\n"
        ).replace("-----END PUBLIC KEY-----", "\n-----END PUBLIC KEY-----")
    key = RSA.import_key(public_key_pem)
    cipher = PKCS1_v1_5.new(key)
    return base64.b64encode(cipher.encrypt(password.encode("utf-8"))).decode("utf-8")


def do_login(base_url, username, password, max_retries=10):
    session = cloudscraper.create_scraper(
        browser={'browser': 'chrome', 'platform': 'windows', 'desktop': True}
    )
    actual_ua = session.headers.get("User-Agent", "")
    log.info(f"[{username}] UA: {actual_ua[:80]}")

    # Header AJAX giống frontend (axios gửi JSON)
    session.headers.update({"X-Requested-With": "XMLHttpRequest"})

    # Step 1: Lấy RSA public key (scene=init, gửi JSON giống frontend)
    log.info(f"[{username}] Step 1: public key từ {base_url}")
    resp = session.post(f"{base_url}/agent/login", json={"scene": "init"}, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    public_key = data.get("public_key") or (data.get("data") or {}).get("public_key")
    if data.get("code") != 1 or not public_key:
        return {"success": False, "error": f"Không lấy được public key: {data}", "attempts": 0}
    encrypted_password = rsa_encrypt(password, public_key)

    for attempt in range(1, max_retries + 1):
        log.info(f"[{username}] Attempt {attempt}/{max_retries}")
        cap_resp = session.get(f"{base_url}/agent/captcha", timeout=10)
        cap_resp.raise_for_status()
        if not cap_resp.headers.get("Content-Type", "").startswith("image"):
            return {"success": False, "error": "Captcha không phải image", "attempts": attempt}

        captcha_text = ocr.classification(cap_resp.content)
        log.info(f"[{username}] Captcha = '{captcha_text}'")
        if not captcha_text or len(captcha_text) < 3:
            continue

        # Login POST: gửi JSON với scene='login' (giống frontend axios)
        login_resp = session.post(
            f"{base_url}/agent/login",
            json={
                "username": username,
                "password": encrypted_password,
                "captcha": captcha_text,
                "scene": "login",
            },
            timeout=15,
        )
        login_resp.raise_for_status()
        result = login_resp.json()
        log.info(f"[{username}] code={result.get('code')}, msg={result.get('msg')}")

        if result.get("code") == 1:
            all_cookies = "; ".join(f"{c.name}={c.value}" for c in session.cookies)
            phpsessid = session.cookies.get("PHPSESSID", "")
            final_ua = session.headers.get("User-Agent", actual_ua)
            log.info(f"[{username}] OK! {attempt} lần, {len(session.cookies)} cookies")
            return {
                "success": True,
                "phpsessid": phpsessid,
                "cookies": all_cookies,
                "user_agent": final_ua,
                "attempts": attempt,
            }

        msg = result.get("msg", "")
        if "xác nhận" in msg.lower() or "captcha" in msg.lower() or "验证码" in msg:
            continue
        return {"success": False, "error": msg or "Login thất bại", "attempts": attempt}

    return {"success": False, "error": f"Hết {max_retries} lần thử", "attempts": max_retries}


@app.route("/login", methods=["POST"])
def login():
    body = request.get_json(force=True, silent=True) or {}
    base_url = body.get("base_url", "").rstrip("/")
    username = body.get("username", "")
    password = body.get("password", "")
    max_retries = body.get("max_retries", 10)
    if not base_url or not username or not password:
        return jsonify({"success": False, "error": "Thiếu base_url, username hoặc password"}), 400
    try:
        return jsonify(do_login(base_url, username, password, max_retries))
    except Exception as e:
        log.error(f"[{username}] Exception: {traceback.format_exc()}")
        return jsonify({"success": False, "error": str(e), "attempts": 0}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    log.info(f"Captcha Solver Service khởi động tại port {port}")
    app.run(host="0.0.0.0", port=port, debug=False)
