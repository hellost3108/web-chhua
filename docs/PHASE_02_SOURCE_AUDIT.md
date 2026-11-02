# PHASE 2 — PHÂN TÍCH SOURCE GỐC (tiktok-live-temple-rpc)

Nguồn: https://github.com/zane-tv/tiktok-live-temple-rpc (commit `2f8b982` — "feat: TikTok Live RPC 9:16 Interactive Buddhist Sanctuary (Bun.js + ZeroTTS)")

## 1. Kiến trúc tổng quan

- **Backend**: 1 file `server.js` (CommonJS, 1223 dòng) — Express (HTTP static + REST), `ws` (WebSocket JSON-RPC 2.0), `tiktok-live-connector` (kết nối TikTok LIVE), `child_process.spawn` để quản lý tiến trình Python `tts_worker.py` thường trú.
- **Frontend**: `public/index.html` (màn hình chùa 9:16 + quick-dock điều khiển khi không phải OBS), `public/admin.html` (dashboard quản trị JSON-RPC đầy đủ, script inline chứ không có file `admin.js` riêng dù design-spec nhắc tới tên này — chỉ là sai khác tài liệu, không phải lỗi), `public/css/live.css` (1122 dòng), `public/js/{live,particles,audio}.js` (tổng ~1600 dòng).
- **TTS**: `tts_worker.py` — tiến trình Python độc lập, giao tiếp với `server.js` qua stdin/stdout JSON-line protocol (không phải HTTP), dùng model `zeroweight-ai/ZeroTTS` qua package PyPI `zerotts`.
- **Lưu trạng thái**: `data/merit-state.json` (gitignored, tự tạo khi chạy), cache âm thanh TTS tại `data/tts-cache/*.wav`.

## 2. ⚠️ PHÁT HIỆN QUAN TRỌNG: Code server.js đã tương thích Node.js sẵn

Đã kiểm tra toàn bộ `server.js` và `tts_worker.py`: **không có bất kỳ API riêng của Bun nào được dùng** (không `Bun.serve`, không `Bun.file`, không `import.meta`, không `bun:*` import, không `bun.lockb`/`bunfig.toml` trong repo). Code dùng:
- `require()` CommonJS chuẩn, `express`, `ws`, `cors`, `tiktok-live-connector` — đều là package npm thường, đã khai báo trong `package.json`.
- `fetch` global (có sẵn từ Node 18+, máy hiện có Node v24.19.0 → OK).
- `fs`, `path`, `http`, `child_process.spawn` — Node core modules chuẩn.

→ **Phase 3 (chuyển Bun→Node) sẽ rất nhẹ**: về lý thuyết chỉ cần sửa `package.json` scripts (`bun run` → `node`) và chạy `npm install` thay cho `bun install`. Không cần sửa logic `server.js`. Sẽ xác nhận bằng `node --check` + chạy thực tế ở Phase 3.

## 3. Danh sách chức năng & phân loại

| # | Chức năng | Vị trí code | Trạng thái |
|---|---|---|---|
| 1 | Giao diện Chánh Điện 9:16 (tượng Phật, hào quang, lư hương, thảm đỏ) | `public/index.html`, `live.css` | Code đầy đủ, **chưa kiểm thử trên browser** (Phase 4) |
| 2 | 8-frame sprite stack nhân vật bái Phật (walk/kneel/bow/prostrate) | `public/assets/devotee_*.png`, `live.js` | Đủ asset, **chưa kiểm thử** |
| 3 | Canvas particle (khói hương, hoa sen rơi, sóng âm) | `particles.js` | Code đầy đủ, **chưa kiểm thử** |
| 4 | Thắp hương / Đảnh lễ (`temple.burnIncense`) | `server.js` Rituals.burnIncense | Logic đầy đủ, **chưa kiểm thử E2E** |
| 5 | Cầu nguyện + Đèn hoa đăng (`temple.sendPrayer`) | Rituals.sendPrayer | Logic đầy đủ, **chưa kiểm thử E2E** |
| 6 | Xin xăm / Gieo quẻ (`temple.drawFortune`) | Rituals.drawFortune + `FORTUNE_DECK` | Logic đầy đủ. **Lưu ý sai khác tài liệu**: comment trong code ghi "BỘ 18 QUẺ", design-spec ghi "24 quẻ", nhưng mảng `FORTUNE_DECK` thực tế chỉ có **10 quẻ** (số 1,8,12,18,24,36,52,68,81,99). Đây là sai khác giữa chú thích/tài liệu và code thật — không phải lỗi chạy, chỉ ghi nhận để không "tưởng" có 18/24 quẻ. Giữ nguyên như code gốc, không tự ý thêm quẻ. |
| 7 | Gõ mõ (`temple.strikeWoodenFish`) + Thỉnh chuông (`temple.ringBell`) | Rituals.* | Logic đầy đủ, **chưa kiểm thử** |
| 8 | Tặng quà nhỏ/vừa/lớn + Đại Lễ Kim Long (`temple.offerGift`, `temple.grandCeremony`) | Rituals.offerGift, gift combo tracker | Logic đầy đủ, xử lý combo gift (repeatCount/groupId) để tránh nhân đôi giá trị khi TikTok gửi nhiều event combo cho 1 lượt tặng, **chưa kiểm thử với combo thật** |
| 9 | Bảng Vàng Công Đức / Leaderboard | `getLeaderboard()` | Logic đầy đủ, **chưa kiểm thử** |
| 10 | Phân tích bình luận tiếng Việt tự động (comment → nghi thức) | `parseViewerComment()` | Dò từ khóa có dấu/không dấu (thắp hương, cầu, chuông, mõ, xăm...), có cooldown chống spam 3.5s/người + bộ lọc ký tự lạ/Zalgo/từ phản cảm. **Chưa kiểm thử với luồng chat thật** |
| 11 | ZeroTTS giọng đọc (Mai Chi) | `tts_worker.py` + `ZeroTTSManager` trong server.js | **PHỤ THUỘC DỊCH VỤ NGOÀI**: cần cài Python + package PyPI `zerotts` + tải model `zeroweight-ai/ZeroTTS` (có thể từ HuggingFace, cần Internet lần đầu). Chưa cài, chưa test — xử lý ở Phase 5. Server có cơ chế chịu lỗi tốt: nếu worker TTS crash/không ready, các RPC khác vẫn hoạt động (không throw) |
| 12 | Dashboard Admin đầy đủ | `public/admin.html` (script inline) | Code đầy đủ, **chưa kiểm thử trên browser** |
| 13 | OBS Browser Source overlay (`?obs=1`) | `live.js` (ẩn `quickDock` khi có query `obs=1`) | Logic đã có, **chưa kiểm thử khung OBS thật** |
| 14 | Kết nối TikTok LIVE thật | `tiktok-live-connector` v2.1.0, `connectTikTokLive()` | **PHỤ THUỘC TÀI KHOẢN TIKTOK ĐANG LIVE THẬT** — không tự test được ở giai đoạn này. Server tự động thử kết nối `@zenfacts_vn` (hard-code trong `state.tiktok.username` / `TIKTOK_USER` env) ngay khi khởi động — **sẽ gây lỗi/cảnh báo vô hại trong log nếu tài khoản đó không đang live**, không làm sập server (có `.catch()`) |
| 15 | Chế độ Auto-Sim (giả lập người xem) | `configureAutoSim()`, `SIM_DEVOTEES` | **Đã có sẵn trong code gốc** — gọi ngẫu nhiên các Rituals.* giống hệt pipeline xử lý event thật. Đây chính là cơ sở tốt để dùng làm "MOCK LIVE" ở Phase 6 theo yêu cầu nhiệm vụ (dùng chung pipeline, không ghi nhận là tương tác thực) |
| 16 | Nhạc nền `bg_chant.m4a` | `.gitignore` loại trừ file này (lý do bản quyền nhạc), `audio.js` | **File audio KHÔNG có trong repo** (cố ý, do bản quyền). Đã kiểm tra `audio.js`: có `onerror` fallback tự chuyển sang nhạc nền tổng hợp bằng Web Audio (`useSynthMusicFallback`) — không vỡ giao diện nếu thiếu file, nhưng sẽ không có bản nhạc gốc "Nam Mô A Di Đà Phật" cho đến khi người dùng tự thêm file `public/assets/bg_chant.m4a` |
| 17 | Web Speech API fallback (nhắc trong design-spec) | — | **KHÔNG tìm thấy trong code thực tế** (`audio.js`, `live.js` không gọi `speechSynthesis`). Thiết kế dự kiến có fallback này nhưng chưa được code. Ghi nhận là **thiếu so với tài liệu thiết kế**, không phải thứ cần tự thêm vào trong phạm vi "giữ nguyên tính năng hiện có" |

## 4. Rủi ro & phụ thuộc dịch vụ ngoài

1. **ZeroTTS (Phase 5)**: cần Python 3.10+, `uv` hoặc `pip`, package `zerotts` (PyPI) — chưa rõ package này có sẵn/tương thích Windows hay cần biên dịch. Cần tải model AI (dung lượng và nguồn chưa xác định) — rủi ro mạng/thời gian tải lần đầu.
2. **tiktok-live-connector v2.1.0**: thư viện bên thứ ba dò API nội bộ không chính thức của TikTok — rủi ro bị đổi API/chặn bất cứ lúc nào, không do lỗi của source gốc. Không sửa/nâng cấp version trừ khi có lỗi thực tế buộc phải làm.
3. **Auto-connect khi khởi động** tới `@zenfacts_vn`: đây là tài khoản demo cứng trong code gốc, không phải tài khoản của người dùng hiện tại — sẽ chỉ gây warning log vô hại nếu không live, giữ nguyên hành vi gốc (không tự ý đổi default username).
4. **File nhạc nền bản quyền** không có trong repo (cố ý) — không phải lỗi migration, là quyết định của tác giả gốc.
5. **`ws` optionalDependencies** (`bufferutil`, `utf-8-validate`) là native addon **tùy chọn** (`peerDependenciesMeta.optional: true`) — không bắt buộc, `npm install` có thể bỏ qua an toàn nếu thiếu công cụ biên dịch C++ trên Windows.

## 5. Giấy phép & dependency

- `package.json` dependencies: `cors@^2.8.5`, `express@^4.19.2`, `tiktok-live-connector@^2.1.0`, `ws@^8.18.0` — toàn bộ cài qua npm, không có package riêng của Bun.
- Repo gốc không có file `LICENSE` ở cấp root (chưa thấy trong lần đọc này) — sẽ không tự thêm license, giữ nguyên như gốc.

## 6. Kế hoạch chuyển đổi (Phase 3)

1. Sửa `package.json`: `"start": "node server.js"`, `"dev": "node --watch server.js"`, thêm `"check": "node --check server.js"`. Không đổi/xóa dependency nào.
2. Chạy `npm install` (thay cho `bun install`).
3. Chạy `node --check server.js` để xác nhận cú pháp hợp lệ trên Node.
4. Chạy `npm start`, kiểm tra server lắng nghe cổng 3000, trả đúng nội dung `/`, `/admin`.
5. Không sửa logic nghiệp vụ trong `server.js`/`tts_worker.py` trừ khi phát sinh lỗi thực tế khi chạy trên Node.

## 7. Checkpoint Git

Đã tạo commit checkpoint lưu lại trạng thái nguyên bản của source gốc (trước khi sửa bất kỳ dòng code nào) — xem lịch sử git sau báo cáo này.
