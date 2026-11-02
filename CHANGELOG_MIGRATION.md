# CHANGELOG — Chuyển đổi Bun.js → Node.js

Nguồn gốc: [zane-tv/tiktok-live-temple-rpc](https://github.com/zane-tv/tiktok-live-temple-rpc) (commit `2f8b982`). Toàn bộ quá trình chuyển đổi thực hiện qua 7 phase, báo cáo chi tiết từng phase tại `docs/PHASE_0X_*.md`.

## Phase 1 — Audit môi trường
Không có thay đổi code. Xem [docs/PHASE_01_ENVIRONMENT.md](docs/PHASE_01_ENVIRONMENT.md).

## Phase 2 — Phân tích source gốc
Không có thay đổi code (chỉ đọc/phân tích). Phát hiện quan trọng: `server.js`/`tts_worker.py` gốc **không dùng API riêng của Bun** — xem [docs/PHASE_02_SOURCE_AUDIT.md](docs/PHASE_02_SOURCE_AUDIT.md).

## Phase 3 — Chuyển Bun.js → Node.js
- `package.json`: scripts `bun run server.js` / `bun --watch server.js` → `node server.js` / `node --watch server.js`, thêm `check: node --check server.js`, thêm `engines.node: ">=18"`.
- **Không sửa 1 dòng logic nghiệp vụ nào** trong `server.js`/`tts_worker.py`/frontend — vì code gốc đã tương thích Node sẵn.
- Chi tiết test: [docs/PHASE_03_NODE_MIGRATION.md](docs/PHASE_03_NODE_MIGRATION.md).

## Phase 4 — Kiểm thử giao diện & chức năng
Không có thay đổi code, chỉ kiểm thử. Toàn bộ 7 nghi thức tương tác, WebSocket reconnect, chế độ OBS, tải 100 sự kiện đều PASS. Xem [docs/PHASE_04_FUNCTIONAL_TESTS.md](docs/PHASE_04_FUNCTIONAL_TESTS.md).

## Phase 5 — ZeroTTS
- **Sửa lỗi Windows thật**: `resolvePythonBin()` trong `server.js` chỉ tìm venv kiểu POSIX (`.venv/bin/python`) và fallback `python3` (không tồn tại mặc định trên Windows). Đã sửa để tìm thêm `.venv/Scripts/python.exe` và fallback `python` trên `win32`.
- Cài Python 3.12 (có xin phép người dùng) + package `zerotts`/`pillow`, test đầy đủ giọng đọc. Xem [docs/PHASE_05_TTS_TEST.md](docs/PHASE_05_TTS_TEST.md).

## Phase 6 — TikTok LIVE & OBS
- **Tính năng mới — Mock Live**: tách 5 handler sự kiện TikTok (`member/chat/like/social/gift`) từ closure cục bộ trong `connectTikTokLive()` thành hàm top-level độc lập (logic giữ nguyên 100%), thêm `mockLiveEvent()`/`configureMockLive()` dùng lại đúng các hàm đó với dữ liệu giả lập offline. 2 RPC method mới: `live.mockEvent`, `live.setMockMode`.
- Xác minh cấu hình OBS Browser Source (1080×1920, 9:16, 30fps). Xem [docs/PHASE_06_TIKTOK_OBS.md](docs/PHASE_06_TIKTOK_OBS.md).

## Phase 7 — Tối ưu, vận hành & bàn giao

### `server.js`
- Logging có cấu trúc: `logLine()` ghi console + file `logs/server-YYYY-MM-DD.log`, nhật ký lỗi (WARN/ERROR) lưu vào mảng `errorLog` bounded (tối đa 50), hiển thị trên dashboard.
- `GET /health` — health check JSON cho công cụ giám sát ngoài.
- ZeroTTS worker tự khởi động lại có giới hạn khi crash (tối đa 3 lần, backoff 5s/10s/15s), reset bộ đếm khi đạt trạng thái `ready`. RPC mới `system.restartTts` để khởi động lại thủ công (reset bộ đếm, không giới hạn số lần thủ công).
- WebSocket server: heartbeat ping/pong 30s dọn kết nối chết.
- Toggle `system.setInteractionsEnabled` — tạm dừng xử lý sự kiện từ TikTok LIVE/Mock Live mà không dừng server; RPC thủ công từ Admin vẫn hoạt động khi tạm dừng.
- Graceful shutdown (`SIGINT`/`SIGTERM`): lưu `data/merit-state.json`, đóng toàn bộ kết nối WebSocket, ngắt TikTok, dừng ZeroTTS worker sạch sẽ trước khi thoát.
- `ADMIN_TOKEN` (biến môi trường, tùy chọn): khóa truy cập `/admin` bằng `?token=...`. Mặc định tắt (không đổi hành vi gốc).
- `getPublicState()` bổ sung `health` (uptime, số client WS, số thí chủ) và `errorLog`.

### `public/admin.html`
- Sửa dòng tiêu đề cứng lỗi thời "(BUN.JS + ZEROTTS MAI CHI)" → "(NODE.JS + ZEROTTS MAI CHI)".
- Thêm mục "5. Vận Hành & Giám Sát": uptime, số client WS, hàng chờ ZeroTTS, số lần tự khởi động lại, nút tạm dừng/bật lại tương tác, nút khởi động lại ZeroTTS thủ công, nhật ký lỗi gần nhất.
- Thêm mục "6. Mock Live": nút giả lập từng loại sự kiện, nút test combo gift, công tắc bật/tắt Mock Live tự động.

### `public/js/live.js`
- WebSocket client: reconnect từ cố định 2000ms → exponential backoff (1s → 2s → 4s → ... tối đa 15s), reset về 1s khi kết nối thành công.

### Script Windows mới
- `START_NODEJS.cmd`, `START_DEV.cmd`, `CHECK_SYSTEM.cmd` — xem [HUONG_DAN_VAN_HANH.md](HUONG_DAN_VAN_HANH.md).

### Tài liệu tiếng Việt mới
`README_VI.md`, `HUONG_DAN_CAI_DAT.md`, `HUONG_DAN_VAN_HANH.md`, `TROUBLESHOOTING.md`, file này.

## Tổng kết: KHÔNG thay đổi

Để tránh hiểu nhầm, liệt kê rõ những gì **giữ nguyên hoàn toàn** so với source gốc:
- Toàn bộ giao diện, CSS, assets, animation, particle engine (`public/index.html`, `live.css`, `particles.js`)
- Toàn bộ logic nghi thức tương tác (`Rituals.*` trong `server.js`)
- Bộ 10 quẻ linh xăm (`FORTUNE_DECK`)
- Giao thức JSON-RPC 2.0 gốc và toàn bộ method cũ (không xóa method nào)
- Logic xử lý bình luận/combo quà tặng TikTok LIVE thật
- `tts_worker.py` (không sửa dòng nào — chỉ `server.js` phía gọi worker được sửa đường dẫn Python)
- Hành vi auto-connect TikTok mặc định khi khởi động (giữ `@zenfacts_vn` làm default, chỉ có thể override qua `TIKTOK_USER`)
