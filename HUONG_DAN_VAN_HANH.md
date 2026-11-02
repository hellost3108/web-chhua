# HƯỚNG DẪN VẬN HÀNH — Chùa Linh Ứng Online (Node.js)

## 1. Khởi động / Dừng server

| Việc cần làm | Cách làm |
|---|---|
| Chạy production | `npm start` hoặc double-click [`START_NODEJS.cmd`](START_NODEJS.cmd) |
| Chạy chế độ phát triển (tự reload khi sửa code) | `npm run dev` hoặc double-click [`START_DEV.cmd`](START_DEV.cmd) |
| Dừng server an toàn | Nhấn `Ctrl+C` trong cửa sổ đang chạy — server sẽ lưu dữ liệu, đóng kết nối WebSocket/TikTok/ZeroTTS gọn gàng rồi mới thoát (xem log dòng `"Đang dừng dịch vụ an toàn"`) |
| Đổi cổng chạy | `set PORT=3001 && npm start` (mặc định 3000) |

**Lưu ý về Ctrl+C trên Windows**: hành vi lưu-dữ-liệu-trước-khi-thoát đã được viết và kiểm tra logic kỹ, nhưng do giới hạn của môi trường phát triển (không có console tương tác thật để gửi tín hiệu Ctrl+C), **chưa xác minh được 100% qua test tự động** — xem ghi chú NOT FULLY TESTED trong [docs/PHASE_07_OPERATIONS.md](docs/PHASE_07_OPERATIONS.md). Khuyến nghị: tự kiểm tra 1 lần bằng cách chạy `START_NODEJS.cmd`, nhấn `Ctrl+C`, và quan sát dòng log "Đã lưu dữ liệu Bảng Vàng Công Đức trước khi thoát." xuất hiện trước khi cửa sổ đóng. Nếu dùng `Đóng cửa sổ (X)` hoặc Task Manager để tắt thay vì Ctrl+C, dữ liệu **có thể không được lưu** — luôn ưu tiên Ctrl+C.

## 2. 3 màn hình chính

| URL | Dùng để |
|---|---|
| `http://localhost:3000` | Màn hình Chánh Điện + bảng điều khiển nhanh (dành cho người vận hành theo dõi) |
| `http://localhost:3000/admin` | Dashboard Admin đầy đủ: RPC thủ công, kết nối TikTok, Mock Live, giám sát vận hành |
| `http://localhost:3000/?obs=1` | Màn hình sạch 9:16, không có control — dùng làm nguồn cho OBS/TikTok LIVE Studio |

## 3. Cấu hình OBS Browser Source

1. Thêm nguồn mới → **Browser** (Trình duyệt)
2. URL: `http://localhost:3000/?obs=1`
3. Width: `1080`, Height: `1920`, FPS: `30`
4. **KHÔNG** tick "Shutdown source when not visible" — nếu tick, nguồn sẽ ngắt kết nối WebSocket mỗi khi chuyển cảnh, mất đồng bộ dữ liệu.
5. Tick "Control audio via OBS" để mixer OBS quản lý âm lượng nhạc nền/giọng đọc.

Chi tiết xác minh (khung 1080×1920, không tràn UI, không lộ control) tại [docs/PHASE_04_FUNCTIONAL_TESTS.md](docs/PHASE_04_FUNCTIONAL_TESTS.md) và [docs/PHASE_06_TIKTOK_OBS.md](docs/PHASE_06_TIKTOK_OBS.md).

## 4. Kết nối TikTok LIVE thật

1. Đảm bảo tài khoản TikTok của bạn **đang phát LIVE công khai**.
2. Vào dashboard Admin (`/admin`) → mục "1. Kết Nối Phòng TikTok Live" → nhập `@username` → bấm "Kết Nối Live".
3. Server sẽ tự nhận diện bình luận/thả tim/follow/quà tặng và kích hoạt nghi thức tương ứng.

**Không cần đăng nhập, không cần cookie, không cần token** — thư viện `tiktok-live-connector` chỉ cần username công khai của phòng đang live. Xem rủi ro & giới hạn của phương thức này tại [docs/PHASE_06_TIKTOK_OBS.md](docs/PHASE_06_TIKTOK_OBS.md) mục 1 (thư viện có thể tạm ngừng hoạt động nếu TikTok đổi cơ chế nội bộ).

**Mặc định server tự động thử kết nối `@zenfacts_vn`** khi khởi động (hành vi có sẵn từ source gốc). Để đổi tài khoản mặc định hoặc tắt auto-connect, đặt biến môi trường trước khi chạy:
```bash
set TIKTOK_USER=@ten_tai_khoan_cua_ban
npm start
```

## 5. Mock Live — test không cần tài khoản TikTok thật

Dùng khi muốn demo/test mà không có livestream thật đang chạy. Vào `/admin` → mục "6. Mock Live":
- Các nút đơn lẻ: Mock vào phòng / bình luận / thả tim / follow / tặng quà
- "Mock: Combo Gift x3" — test riêng logic chống trùng khi 1 người tặng quà combo nhiều lần
- "Bật Mock Live Tự Động" — tự sinh 1 sự kiện ngẫu nhiên mỗi ~4 giây, bấm lại để tắt

Người dùng mock luôn có tên bắt đầu bằng `MOCK_` và id bắt đầu bằng `mock_` — không bao giờ lẫn với người xem thật. Chi tiết thiết kế: [docs/PHASE_06_TIKTOK_OBS.md](docs/PHASE_06_TIKTOK_OBS.md).

## 6. Dashboard vận hành & giám sát (mục "5. Vận Hành & Giám Sát" trên `/admin`)

- **Thời gian chạy, số client WebSocket, số thí chủ đã ghi nhận** — theo dõi nhanh tình trạng server.
- **ZeroTTS — đang chờ xử lý / lần tự khởi động lại** — nếu "lần tự khởi động lại" đạt 3 (giới hạn tối đa) và trạng thái là `error`, bấm nút **"Khởi Động Lại ZeroTTS Worker"** để thử lại thủ công (reset bộ đếm).
- **Tạm Dừng Tương Tác Người Xem** — khi bật, mọi sự kiện từ TikTok LIVE thật/Mock Live bị bỏ qua (không cộng công đức, không kích hoạt hoạt cảnh) — hữu ích khi cần tạm ngừng vì lý do kiểm duyệt mà không muốn tắt hẳn server. Các nút RPC thủ công trong mục 2 vẫn hoạt động bình thường khi đang tạm dừng.
- **Nhật ký lỗi gần nhất** — hiển thị tối đa 20 dòng WARN/ERROR gần nhất (TikTok mất kết nối, ZeroTTS lỗi...). Log đầy đủ hơn được ghi vào file `logs/server-YYYY-MM-DD.log`.

## 7. Health check cho công cụ giám sát ngoài

```
GET http://localhost:3000/health
→ {"status":"ok","uptimeSec":123,"tts":"ready","tiktokConnected":true,"wsClients":2}
```

Dùng endpoint này với uptime monitor (UptimeRobot, Healthchecks.io...) hoặc script giám sát riêng.

## 8. Bảo mật dashboard Admin (tùy chọn)

Mặc định `/admin` **không yêu cầu đăng nhập** (giống hành vi gốc, phù hợp khi chạy trên `localhost` riêng tư). Nếu dự định mở server ra ngoài mạng nội bộ/Internet (ví dụ qua port-forward hoặc ngrok), **nên đặt token** trước:

```bash
set ADMIN_TOKEN=mot-chuoi-bi-mat-cua-ban
npm start
```

Khi đó truy cập `/admin` phải kèm `?token=mot-chuoi-bi-mat-cua-ban`, nếu không sẽ bị từ chối (401). **Lưu ý**: endpoint `POST /rpc` (dùng cho TikFinity/Streamer.bot/webhook) **vẫn mở công khai theo đúng thiết kế gốc** của dự án — nếu mở server ra Internet, nên giới hạn thêm bằng firewall/reverse-proxy, không chỉ dựa vào `ADMIN_TOKEN`.

## 9. Chạy dài hạn / tự phục hồi lỗi

Đã tích hợp sẵn (không cần cài thêm gì):
- ZeroTTS worker tự khởi động lại tối đa 3 lần khi crash (backoff 5s/10s/15s), không retry vô hạn.
- WebSocket server có heartbeat dọn kết nối chết; client tự phục hồi kết nối với backoff tăng dần.
- Lỗi TikTok LIVE (mất kết nối, phòng offline) không làm sập server, chỉ ghi log và hiển thị trên dashboard.

**Tùy chọn nâng cao — PM2** (không tự động cài, cần tự đánh giá & cài nếu muốn): PM2 là trình quản lý tiến trình phổ biến cho Node.js, hỗ trợ tự khởi động lại toàn bộ server khi crash, xem log tập trung, và (nếu muốn) chạy nền không cần giữ cửa sổ Terminal mở. Cài: `npm install -g pm2`, chạy: `pm2 start server.js --name chua-linh-ung`. **Dự án KHÔNG tự thiết lập PM2 hay auto-start cùng Windows** — đây là lựa chọn của người vận hành, cần tự cài và cấu hình nếu muốn.

## 10. Dữ liệu & sao lưu

- Dữ liệu Bảng Vàng Công Đức: `data/merit-state.json` — nên sao lưu định kỳ nếu muốn giữ lịch sử qua nhiều buổi live.
- Cache âm thanh TTS: `data/tts-cache/*.wav` — có thể xóa an toàn bất cứ lúc nào để giải phóng dung lượng, sẽ tự tổng hợp lại khi cần.
- Log: `logs/server-YYYY-MM-DD.log` — tự tạo file mới theo ngày, không tự xóa file cũ (dọn thủ công nếu cần).
