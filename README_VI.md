# 🪷 Chùa Linh Ứng Online — TikTok Live RPC (Node.js)

Hệ thống phát trực tiếp tương tác (Interactive TikTok Live Stream & JSON-RPC 2.0) chuẩn khung dọc **9:16 (1080×1920)** dành cho OBS Studio / TikTok Live Studio, tích hợp giọng đọc AI tiếng Việt **ZeroTTS**. Dự án này là bản chuyển đổi chạy trên **Node.js** từ source gốc viết cho Bun.js tại [zane-tv/tiktok-live-temple-rpc](https://github.com/zane-tv/tiktok-live-temple-rpc).

> Toàn bộ giao diện, hoạt cảnh, assets, tính năng tương tác và giao thức JSON-RPC 2.0 được **giữ nguyên 100%** so với bản gốc — chỉ thay đổi runtime từ Bun sang Node.js. Chi tiết đầy đủ các thay đổi: [CHANGELOG_MIGRATION.md](CHANGELOG_MIGRATION.md).

## Tài liệu

| File | Nội dung |
|---|---|
| [HUONG_DAN_CAI_DAT.md](HUONG_DAN_CAI_DAT.md) | Cài đặt từ đầu: Node.js, dependency, ZeroTTS (Python) |
| [HUONG_DAN_VAN_HANH.md](HUONG_DAN_VAN_HANH.md) | Chạy server, cấu hình OBS, kết nối TikTok LIVE, dashboard Admin, Mock Live, vận hành dài hạn |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Xử lý sự cố thường gặp |
| [CHANGELOG_MIGRATION.md](CHANGELOG_MIGRATION.md) | Nhật ký đầy đủ quá trình chuyển đổi Bun → Node.js |
| [docs/PHASE_01_ENVIRONMENT.md](docs/PHASE_01_ENVIRONMENT.md) … [docs/PHASE_06_TIKTOK_OBS.md](docs/PHASE_06_TIKTOK_OBS.md) | Báo cáo kiểm thử chi tiết từng giai đoạn chuyển đổi |

## Khởi động nhanh

```bash
npm install
npm start
```

Hoặc trên Windows, double-click [`START_NODEJS.cmd`](START_NODEJS.cmd) (tự kiểm tra `node_modules`, tự `npm install` nếu thiếu).

- **Màn hình Chánh Điện**: http://localhost:3000
- **Dashboard Admin**: http://localhost:3000/admin
- **OBS Browser Source (sạch, 9:16)**: http://localhost:3000/?obs=1

## Tính năng chính (giữ nguyên từ source gốc)

- 🔥 Thắp hương & Đảnh lễ Tam Bái — sprite 8 khung hình đi/quỳ/lạy
- 🏮 Thả Đèn Hoa Đăng / Sớ Cầu Nguyện kèm giọng đọc AI
- 🎋 Xin Xăm / Gieo Quẻ (bộ 10 quẻ linh xăm)
- 🪵 Gõ Mõ & 🔔 Thỉnh Đại Hồng Chung
- 📜 Bảng Vàng Công Đức — 6 đệm quỳ VIP + 40 chỗ Đạo Tràng
- 🔌 JSON-RPC 2.0 qua HTTP (`POST /rpc`) và WebSocket (`ws://.../ws`)
- 🎙️ ZeroTTS — giọng đọc tiếng Việt AI (8 giọng, mặc định "Mai Chi")
- 📡 Kết nối TikTok LIVE thật qua `tiktok-live-connector` (username công khai, không cookie/token)

## Bổ sung mới trong bản Node.js này (Phase 6-7)

- 🧪 **Mock Live**: giả lập đầy đủ sự kiện TikTok (bình luận, thả tim, follow, tặng quà kể cả combo) dùng chung pipeline với LIVE thật nhưng hoàn toàn offline — an toàn để test/demo. Xem [docs/PHASE_06_TIKTOK_OBS.md](docs/PHASE_06_TIKTOK_OBS.md).
- 🛠️ **Dashboard vận hành**: uptime, số client WebSocket, hàng chờ ZeroTTS, nhật ký lỗi, nút tạm dừng tương tác, nút khởi động lại ZeroTTS an toàn.
- 🩺 `GET /health` — health check cho công cụ giám sát ngoài.
- 🔁 ZeroTTS worker tự khởi động lại có giới hạn (tối đa 3 lần) khi crash, không retry vô hạn.
- 📶 WebSocket client tự phục hồi kết nối với backoff tăng dần; server có heartbeat ping/pong dọn kết nối chết.
- 💾 Lưu dữ liệu an toàn khi tắt server (`Ctrl+C`).
- 🔒 Tùy chọn khóa dashboard Admin bằng `ADMIN_TOKEN` (mặc định tắt, không đổi hành vi gốc).

## Giấy phép & nguồn gốc

Toàn bộ thiết kế giao diện, nghi thức tương tác và nội dung gốc thuộc về tác giả dự án gốc [zane-tv/tiktok-live-temple-rpc](https://github.com/zane-tv/tiktok-live-temple-rpc). Bản này chỉ thực hiện chuyển đổi runtime và bổ sung công cụ vận hành/kiểm thử.
