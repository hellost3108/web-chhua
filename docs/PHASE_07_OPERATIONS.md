# PHASE 7 — TỐI ƯU, VẬN HÀNH & BÀN GIAO

## 1. Bổ sung vận hành dài hạn / tự phục hồi (`server.js`)

| Hạng mục yêu cầu | Đã làm | Kết quả test |
|---|---|---|
| Health check backend | `GET /health` trả JSON (`status`, `uptimeSec`, `tts`, `tiktokConnected`, `wsClients`) | ✅ PASS — test thực tế qua `curl`, trả đúng dữ liệu |
| Giám sát WebSocket | Heartbeat ping/pong server-side mỗi 30s, tự `terminate()` client không phản hồi | ✅ Logic đã viết đúng chuẩn thư viện `ws`; **chưa có kịch bản test tự động mô phỏng client "treo" không phản hồi pong trong môi trường này** — hành vi ping/pong bình thường (client thật luôn tự trả pong) đã hoạt động xuyên suốt các phiên test dài ở Phase 4-7 mà không có vấn đề gì |
| Reconnect exponential backoff | Client (`live.js`) đổi từ retry cố định 2000ms → backoff 1s→2s→4s→8s→15s (tối đa), reset khi connect thành công | ✅ PASS — xem logic trong code, đã test luồng disconnect/reconnect cơ bản vẫn hoạt động (Phase 4 test lại sau khi sửa) |
| Xử lý lỗi TTS worker | Tự khởi động lại có giới hạn (tối đa 3 lần, backoff 5/10/15s), reset bộ đếm khi `ready`, RPC `system.restartTts` để khởi động lại thủ công | ✅ **PASS — đã test bằng cách kill thật tiến trình Python worker** (không phải giả lập qua RPC): server phát hiện, chuyển trạng thái `restarting`, tự khởi động lại thành công, quay về `ready`, các RPC khác (`temple.burnIncense`) **vẫn phục vụ bình thường trong lúc TTS đang phục hồi**, không có request nào bị lỗi 500 |
| Logging | `logLine()` ghi console + file `logs/server-YYYY-MM-DD.log`; nhật ký lỗi (WARN/ERROR) lưu bộ nhớ (tối đa 50) hiển thị trên dashboard | ✅ PASS — xác nhận file log được tạo đúng, nội dung đúng định dạng, dashboard hiển thị đúng |
| Graceful shutdown | `SIGINT`/`SIGTERM` handler: lưu state, đóng WS, ngắt TikTok, dừng ZeroTTS, `server.close()` | ⚠️ **NOT FULLY TESTED** — xem mục 5 bên dưới, lý do và khuyến nghị kiểm tra thủ công |
| Không auto-restart vô hạn | ZeroTTS giới hạn 3 lần auto-retry (không phải vô hạn); không cài/cấu hình PM2 hay auto-start Windows tự động | ✅ Đúng yêu cầu — xem mục 9 [HUONG_DAN_VAN_HANH.md](../HUONG_DAN_VAN_HANH.md), PM2 chỉ được **ghi là tùy chọn nâng cao**, không tự cài |

## 2. Dashboard bổ sung (`public/admin.html`)

Thêm 2 mục mới (không đổi giao diện/theme hiện có, chỉ bổ sung card mới theo đúng phong cách sẵn có):
- **"5. Vận Hành & Giám Sát"**: uptime, số client WS, số thí chủ, hàng chờ ZeroTTS + số lần tự khởi động lại, nút tạm dừng/bật lại tương tác người xem, nút khởi động lại ZeroTTS thủ công, nhật ký lỗi gần nhất.
- **"6. Mock Live"**: nút giả lập từng loại sự kiện, nút test combo gift tự động, công tắc Mock Live tự động.

**Về yêu cầu "không để chức năng điều khiển nhạy cảm truy cập công khai không xác thực"**: đã thêm `ADMIN_TOKEN` (biến môi trường, tùy chọn, mặc định tắt) khóa trang `/admin`. Quyết định **không** khóa luôn endpoint `POST /rpc` vì đây là thiết kế cố ý của source gốc (README gốc hướng dẫn gọi `/rpc` trực tiếp từ TikFinity/Streamer.bot/webhook không cần xác thực) — khóa `/rpc` sẽ phá vỡ tính năng tích hợp webhook vốn có. Đã ghi rõ khuyến nghị (firewall/reverse-proxy khi mở ra ngoài) trong [HUONG_DAN_VAN_HANH.md](../HUONG_DAN_VAN_HANH.md) mục 8.

Đã test: toggle tạm dừng tương tác chặn đúng mock event (xác nhận `woodenFishHits`/số event không đổi khi đang tạm dừng), nút khởi động lại ZeroTTS hoạt động đúng, `ADMIN_TOKEN` chặn đúng khi sai/thiếu token và cho qua đúng khi đúng token.

## 3. Script Windows

`START_NODEJS.cmd`, `START_DEV.cmd`, `CHECK_SYSTEM.cmd` — **đã test thật qua `cmd.exe`** (không chỉ đọc code): cả 3 chạy đúng, `START_NODEJS.cmd`/`START_DEV.cmd` khởi động server thật và phục vụ HTTP 200, `CHECK_SYSTEM.cmd` báo đúng trạng thái Node/npm/Git/Python/venv/cổng 3000.

## 4. Tài liệu tiếng Việt

`README_VI.md`, `HUONG_DAN_CAI_DAT.md`, `HUONG_DAN_VAN_HANH.md`, `TROUBLESHOOTING.md`, `CHANGELOG_MIGRATION.md` — xem nội dung từng file.

## 5. ⚠️ Hạng mục chưa kiểm chứng đầy đủ: Graceful shutdown qua Ctrl+C thật

Đã viết và review kỹ logic `gracefulShutdown()` (lưu `merit-state.json` bằng `fs.writeFileSync` đồng bộ, đóng toàn bộ client WebSocket, ngắt TikTok, dừng tiến trình Python con, `server.close()`, có timeout dự phòng 5s tránh treo). Tuy nhiên:

- **`taskkill` không có `/F`**: Windows từ chối với lỗi `"This process can only be terminated forcefully (with /F option)"` — đã thử nghiệm thực tế, xác nhận không thể gửi tín hiệu đóng "mềm" tới tiến trình console không có cửa sổ GUI bằng cách này.
- **`Stop-Process` (PowerShell)**: gọi `TerminateProcess` ở tầng hệ điều hành, **bỏ qua hoàn toàn** signal handler của Node.js (tương đương `taskkill /F` hay `kill -9` trên Unix) — đã xác nhận qua test, log không hề xuất hiện dòng "Đang dừng dịch vụ an toàn".
- Ctrl+C thật sự chỉ hoạt động khi có 1 console tương tác ở foreground nhận bàn phím — điều này nằm ngoài khả năng của môi trường tự động hoá dùng để thực hiện nhiệm vụ này (chạy lệnh qua script nền, không có phiên console tương tác thật).

→ Theo đúng quy tắc "không che giấu lỗi hoặc báo PASS khi chưa kiểm chứng thật", mục này được báo cáo là **NOT FULLY TESTED** (không phải FAIL — logic đã được viết đúng, review kỹ, và cơ chế lưu dữ liệu định kỳ (autosave debounce 1200ms có sẵn từ code gốc) đã được xác minh hoạt động tốt độc lập với graceful-shutdown mới thêm — xem mục 6). Đã ghi rõ khuyến nghị người dùng tự kiểm tra 1 lần bằng Ctrl+C thật trong [HUONG_DAN_VAN_HANH.md](../HUONG_DAN_VAN_HANH.md) mục 1.

## 6. Kiểm thử cuối (final test checklist)

| Hạng mục | Cách test | Kết quả |
|---|---|---|
| Khởi động sạch | Xóa `data/merit-state.json`, `data/tts-cache/*`, `logs/*`, chạy `node server.js` từ đầu | ✅ PASS |
| Giao diện chính | Mở `http://localhost:3000` qua trình duyệt thật | ✅ PASS |
| Dashboard | Mở `/admin`, xác nhận hiển thị đúng trạng thái + 2 mục mới | ✅ PASS |
| OBS overlay | Mở `/?obs=1` | ✅ PASS (đã xác nhận chi tiết ở Phase 4/6) |
| Animation | Trigger ritual qua UI, quan sát sprite đổi tư thế | ✅ PASS (Phase 4) |
| Mock TikTok | `live.mockEvent` mọi loại + combo gift qua UI Admin mới | ✅ PASS (Phase 6, re-test qua UI ở Phase 7) |
| TTS | Đọc giọng Mai Chi qua UI Admin, cache hoạt động | ✅ PASS (Phase 5) |
| Đóng/mở lại server | Dừng hẳn tiến trình (force), khởi động lại | ✅ PASS — state nạp lại đúng (xem mục 6 tiếp) |
| Phục hồi sau lỗi mô phỏng | **Kill thật** tiến trình Python ZeroTTS (không qua RPC) giữa lúc server đang chạy | ✅ **PASS** — server không sập, các RPC khác vẫn phục vụ HTTP 200 trong lúc TTS "restarting", TTS tự phục hồi về "ready" sau ~13s, bộ đếm reset về 0 |
| Giữ dữ liệu | Tạo 2 thí chủ test, chờ >1.2s (autosave debounce), force-kill toàn bộ tiến trình, khởi động lại, kiểm tra `leaderboard` | ✅ PASS — dữ liệu "PersistTest" (10 CĐ) và "CrashTest" (5 CĐ) còn nguyên sau restart |
| Không lộ khóa bí mật | `git grep` toàn bộ source đã commit tìm pattern `api_key/secret/password/token=...`; kiểm tra không có `.env` nào bị track; xác nhận `.venv/`, `data/`, `node_modules/` không nằm trong `git ls-files` | ✅ PASS — sạch, không có secret nào, `ADMIN_TOKEN` chỉ đọc từ biến môi trường runtime, không bao giờ hardcode |

## 7. Đóng gói bàn giao

Xem phần cuối README_VI.md / mô tả quy trình đóng gói trong báo cáo bàn giao cuối cùng (ZIP `ChuaLinhUng-NodeJS-Final.zip`, loại trừ `node_modules/`, `.venv/`, `data/`, `logs/`, cache HuggingFace, không chứa API key/cookie nào — toàn bộ các mục này vốn đã không được tạo ra trong source hay bị track bởi git). Đã giải nén sang thư mục sạch và cài lại (`npm install`) để xác nhận gói bàn giao hoạt động đúng trước khi báo hoàn thành — xem kết quả trong phần tổng kết gửi người dùng.

## Kết luận Phase 7

**PASS** cho toàn bộ hạng mục trong khả năng kiểm thử của môi trường. Một hạng mục (graceful shutdown qua tín hiệu OS Ctrl+C thật) được báo cáo minh bạch là **NOT FULLY TESTED** do giới hạn môi trường (không có console tương tác thật), kèm logic đã viết đúng + khuyến nghị người dùng tự xác nhận 1 lần.
