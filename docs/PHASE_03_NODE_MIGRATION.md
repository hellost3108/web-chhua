# PHASE 3 — CHUYỂN BUN.JS SANG NODE.JS

## 1. Thay đổi đã thực hiện

Theo kết luận ở Phase 2 (xem [`docs/PHASE_02_SOURCE_AUDIT.md`](./PHASE_02_SOURCE_AUDIT.md)), `server.js` và `tts_worker.py` **không dùng API riêng của Bun**, nên chỉ cần sửa `package.json`:

```diff
-  "description": "TikTok Live RPC Interactive Buddhist Temple (Bun.js + ZeroTTS giọng Mai Chi)",
+  "description": "TikTok Live RPC Interactive Buddhist Temple (Node.js + ZeroTTS giọng Mai Chi)",
   "main": "server.js",
+  "engines": {
+    "node": ">=18"
+  },
   "scripts": {
-    "start": "bun run server.js",
-    "dev": "bun --watch server.js"
+    "start": "node server.js",
+    "dev": "node --watch server.js",
+    "check": "node --check server.js"
   },
```

Không có dòng nào trong `server.js`, `tts_worker.py`, hay bất kỳ file frontend nào bị sửa. Không xóa/đổi dependency nào trong `dependencies`.

## 2. Kết quả kiểm thử

| Bước | Lệnh | Kết quả |
|---|---|---|
| Cài dependency | `npm install` | ✅ 118 packages, 0 vulnerabilities, không lỗi biên dịch native (gói `bufferutil`/`utf-8-validate` của `ws` là optional, không cần) |
| Kiểm tra cú pháp | `npm run check` (`node --check server.js`) | ✅ Hợp lệ |
| Khởi động server | `npm start` (`node server.js`) | ✅ Server lắng nghe cổng 3000, log khởi động đầy đủ |
| `GET /` | `curl http://localhost:3000/` | ✅ HTTP 200, 14000 bytes (giao diện Chánh Điện) |
| `GET /admin` | `curl http://localhost:3000/admin` | ✅ HTTP 200, 9417 bytes (dashboard) |
| `GET /?obs=1` | `curl "http://localhost:3000/?obs=1"` | ✅ HTTP 200, 14000 bytes (cùng HTML, ẩn dock bằng JS phía client qua query param — đã xác nhận logic trong `live.js`) |
| `GET /api/state` | `curl http://localhost:3000/api/state` | ✅ HTTP 200, trả JSON trạng thái chùa đúng cấu trúc |
| `GET /js/live.js` | — | ✅ HTTP 200, 33130 bytes |
| `GET /assets/amitabha_stage.png` | — | ✅ HTTP 200, 3.66MB — asset ảnh phục vụ đúng |

→ **Server chạy hoàn toàn bằng `npm start`, không còn phụ thuộc Bun lúc runtime.**

## 3. ⚠️ Sự cố phát sinh trong lúc test & cách xử lý

Khi chạy `npm start` lần đầu để kiểm thử, code gốc có đoạn **tự động kết nối tới phòng TikTok LIVE** khi khởi động server (hành vi có sẵn trong `server.js` gốc, dòng cuối file — tự kết nối tới `@zenfacts_vn`, một tài khoản demo cứng của tác giả gốc, không phải tài khoản của người dùng hiện tại):

```js
const defaultChannel = process.env.TIKTOK_USER || state.tiktok?.username || 'zenfacts_vn';
if (defaultChannel) {
  connectTikTokLive(defaultChannel).catch(...)
}
```

Tài khoản `@zenfacts_vn` **đang live thật** tại thời điểm test, nên server đã kết nối thành công và nhận một số bình luận thật từ người xem thật (tên hiển thị + avatar công khai trên livestream đó) trong vài giây trước khi tôi dừng server. Dữ liệu này bị `recordDevotee()` lưu tạm vào `data/merit-state.json` (file cục bộ, **không** nằm trong git — đã bị `.gitignore` loại trừ nên không bao giờ lên repo).

**Đây không phải do tôi chủ động bật livestream hay dùng cookie/token nào** — đây là hành vi mặc định có sẵn trong source gốc. Nhưng vì ràng buộc nhiệm vụ yêu cầu "chỉ dùng chế độ MOCK LIVE khi kiểm thử", tôi đã:
1. **Dừng server ngay** khi phát hiện (dùng PowerShell `Stop-Process`).
2. **Xóa `data/merit-state.json`** để không lưu lại thông tin (tên hiển thị, URL avatar) của người xem thật thu được ngoài ý muốn.
3. Với các lần chạy thử tiếp theo, **ghi đè bằng biến môi trường `TIKTOK_USER`** với một tên không tồn tại (ví dụ `TIKTOK_USER=chualinhung_test_offline_000_notlive npm start`) để server thử kết nối một phòng không có thật → thất bại an toàn ("Failed to retrieve Room ID"), không chạm vào bất kỳ phòng live thật nào. Đã xác nhận cách này hoạt động đúng (xem log: `[Auto-Connect ...] Chưa kết nối được ngay: Failed to retrieve Room ID from all sources.`).
4. **Không sửa code gốc** của hành vi auto-connect này (giữ nguyên tính năng mặc định như thiết kế gốc) — chỉ vô hiệu hóa nó cho mục đích test bằng biến môi trường bên ngoài. Sẽ hỏi người dùng ở Phase 7 xem có muốn đổi tài khoản mặc định / tắt auto-connect khi bàn giao sản phẩm thật không.

**Khuyến nghị cho các phase kiểm thử tiếp theo (Phase 4, 6, 7)**: luôn chạy server test với `TIKTOK_USER` đặt thành một giá trị giả/không tồn tại, trừ khi đang chủ động test tính năng TikTok LIVE với tài khoản người dùng cung cấp và đã xác nhận.

## 4. Đánh giá ảnh hưởng chức năng gốc

Không có — toàn bộ logic nghiệp vụ (`Rituals`, JSON-RPC dispatcher, TikTok event handlers, ZeroTTS manager) giữ nguyên 100% so với source gốc. Chỉ thay đổi cách khởi động tiến trình (Bun → Node).

## PASS/FAIL

**PASS** — `npm start` chạy ổn định, phục vụ đúng `/`, `/admin`, `/?obs=1`; không còn phụ thuộc Bun. Đã xử lý và ghi nhận minh bạch sự cố auto-connect TikTok ngoài ý muốn.
